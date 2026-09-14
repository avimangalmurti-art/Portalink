// Candidate worker core. No Deno.serve, scheduler, credentials or startup side
// effects. The caller must supply a service client and explicitly release it.
export async function runDeletionTick(admin, { enabled = false, maxBatches = 10 } = {}) {
  if (!enabled) return { status: 'disabled' };
  const rpc = async (name, args = {}) => {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error(`Deletion checkpoint failed: ${name}`);
    return data;
  };
  const job = await rpc('claim_account_deletion');
  if (!job) return { status: 'idle' };
  const keys = { p_job: job.id, p_lease: job.lease_token };
  try {
    for (let i = 0; i < maxBatches; i++) {
      const batch = await rpc('account_deletion_batch', keys);
      if (batch.phase === 'storage') {
        for (const bucket of new Set(batch.files.map(file => file.bucket))) {
          const files = batch.files.filter(file => file.bucket === bucket);
          const { error } = await admin.storage.from(bucket).remove(files.map(file => file.path));
          if (error) throw new Error('Storage removal needs retry');
          await rpc('checkpoint_account_deletion_files', { ...keys, p_files: files });
        }
        continue;
      }
      if (batch.phase === 'anonymize') {
        await rpc('anonymize_account_deletion', keys);
        continue;
      }
      if (batch.phase === 'auth') {
        // The previous attempt may have deleted Auth but lost its HTTP reply.
        // Only an explicit provider not-found is success; 401/network != absent.
        const result = await admin.auth.admin.getUserById(job.account_id);
        const missing = result.error?.code === 'user_not_found' || (result.error?.status === 404 && result.error?.code === 'not_found');
        if (result.error && !missing) throw new Error('Auth lookup needs retry');
        if (!missing) {
          if (!result.data?.user || result.data.user.id !== job.account_id) throw new Error('Auth lookup did not confirm identity');
          const { error } = await admin.auth.admin.deleteUser(job.account_id);
          if (error && error.code !== 'user_not_found') throw new Error('Auth deletion needs retry');
        }
        await rpc('finish_account_deletion', keys);
        return { status: 'completed', jobId: job.id };
      }
      throw new Error('Unexpected deletion phase');
    }
    return { status: 'checkpointed', jobId: job.id };
  } catch (error) {
    // Sanitized phase error only. No token, filename, email or user content logs.
    await rpc('fail_account_deletion', { ...keys, p_error: error instanceof Error ? error.message : 'Deletion needs retry' }).catch(() => {});
    return { status: 'retry', jobId: job.id };
  }
}
