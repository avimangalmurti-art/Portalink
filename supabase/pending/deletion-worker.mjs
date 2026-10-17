// Candidate core only: no scheduler, credentials, startup or deployment effects.
import { deletionManifestDigest } from './deletion-d1.mjs';
const explicitlyAbsent = error => Boolean(error && (
  error.code === 'user_not_found' && (error.status === undefined || error.status === 404)
  || error.code === 'not_found' && error.status === 404
));

export async function runDeletionTick(admin, { enabled = false, maxBatches = 10, accountId = null, d1 = null } = {}) {
  if (!enabled) return { status: 'disabled' };
  if (typeof d1 !== 'function' || d1.isConfigured === false) return { status: 'retry' };
  const rpc = async (name, args = {}) => {
    const result = await admin.rpc(name, args);
    if (!result || result.error || !Object.hasOwn(result, 'data')) throw new Error('Deletion checkpoint needs retry');
    return result.data;
  };
  let job;
  try { job = await rpc('claim_account_deletion', accountId ? { p_account_id: accountId } : {}); }
  catch { return { status: 'retry' }; }
  if (job === null) return { status: 'idle' };
  if (!job || !['id', 'account_id', 'lease_token'].every(key => typeof job[key] === 'string' && job[key])
    || accountId && job.account_id !== accountId) return { status: 'retry' };
  const keys = { p_job: job.id, p_lease: job.lease_token };
  const lookup = async () => {
    const result = await admin.auth.admin.getUserById(job.account_id);
    if (explicitlyAbsent(result?.error)) return true;
    if (!result || result.error || result.data?.user?.id !== job.account_id) throw new Error('Auth lookup needs retry');
    return false;
  };
  try {
    if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) throw new Error('Invalid deletion batch bound');
    for (let i = 0; i < maxBatches; i++) {
      const batch = await rpc('account_deletion_batch', keys);
      if (!batch || typeof batch !== 'object') throw new Error('Invalid deletion phase');
      if (batch.phase === 'storage') {
        // SQL normally supplies at most 100 immutable owned objects. Reject an
        // oversized/malformed reply before any external removal is attempted.
        if (!Array.isArray(batch.files) || batch.files.length < 1 || batch.files.length > 100
          || batch.files.some(file => !file || typeof file.bucket !== 'string' || !file.bucket
            || typeof file.path !== 'string' || !file.path)) throw new Error('Invalid Storage batch');
        for (const bucket of new Set(batch.files.map(file => file.bucket))) {
          const files = batch.files.filter(file => file.bucket === bucket).map(({ bucket, path }) => ({ bucket, path }));
          const result = await admin.storage.from(bucket).remove(files.map(file => file.path));
          if (!result || !Object.hasOwn(result, 'error') || result.error !== null) throw new Error('Storage removal needs retry');
          // SQL confirms manifest objects are absent before advancing checkpoints.
          await rpc('checkpoint_account_deletion_files', { ...keys, p_files: files });
        }
        continue;
      }
      if (batch.phase === 'anonymize') {
        await rpc('anonymize_account_deletion', keys);
        continue;
      }
      if (batch.phase === 'd1') {
        const manifest=batch.manifest;
        if (typeof d1 !== 'function' || !manifest || manifest.version !== 1 || manifest.jobId !== job.id || manifest.accountId !== job.account_id
          || !Array.isArray(manifest.ownedProjectIds) || manifest.ownedProjectIds.some(id=>typeof id!=='string')) throw new Error('D1 deletion needs retry');
        const digest=await deletionManifestDigest(manifest);
        const result=await d1(manifest);
        if(result?.completed!==true || result.jobId!==job.id || result.manifestDigest!==digest)throw new Error('D1 deletion needs retry');
        await rpc('checkpoint_account_deletion_d1',{...keys,p_account_id:manifest.accountId,p_project_ids:manifest.ownedProjectIds,p_manifest_hash:digest});
        continue;
      }
      if (batch.phase === 'auth') {
        // SQL grants this phase only after storage and anonymization checkpoints.
        if (!await lookup()) {
          const result = await admin.auth.admin.deleteUser(job.account_id);
          if (!result || !Object.hasOwn(result, 'error') || result.error !== null && !explicitlyAbsent(result.error)) throw new Error('Auth deletion needs retry');
          // Acknowledgement alone is insufficient: verify explicit provider absence.
          if (!await lookup()) throw new Error('Auth deletion not yet confirmed');
        }
        // SQL checks Auth absence, Storage and phase checkpoints before releasing email.
        await rpc('finish_account_deletion', keys);
        return { status: 'completed', jobId: job.id };
      }
      throw new Error('Unexpected deletion phase');
    }
    return { status: 'checkpointed', jobId: job.id };
  } catch {
    // Never store provider/token/object details in durable error text.
    await rpc('fail_account_deletion', { ...keys, p_error: 'Deletion needs retry' }).catch(() => {
      // Failure recording is best effort; the durable phase still permits retry.
    });
    return { status: 'retry', jobId: job.id };
  }
}
