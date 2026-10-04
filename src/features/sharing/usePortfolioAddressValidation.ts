import { useEffect, useState } from 'react';
import { normalizePublicHandle, validHandle, type ShareAddress } from './shareModel';
export type AddressValidation = { handle: string; status: 'current' | 'checking' | 'available' | 'unavailable' | 'invalid' | 'error'; message: string };
export function immediateAddressValidation(handle: string, address: ShareAddress | null): AddressValidation | null {
  if (!validHandle(handle)) return { handle, status: 'invalid', message: 'Use 3–30 lowercase letters, numbers or dots. Reserved addresses cannot be used.' };
  if (!address) return { handle, status: 'checking', message: 'Loading your current address…' };
  if (handle === address.handle) return { handle, status: 'current', message: 'This is your current address.' };
  if (!address.available) return { handle, status: 'unavailable', message: 'Address editing is unavailable. Your existing portfolio link still works.' };
  return null;
}
export function usePortfolioAddressValidation(enabled: boolean, value: string, address: ShareAddress | null, check?: (handle: string) => Promise<'available' | 'taken' | 'unavailable'>) {
  const handle = normalizePublicHandle(value);
  const [result, setResult] = useState<AddressValidation | null>(null);
  useEffect(() => {
    if (!enabled || immediateAddressValidation(handle, address)) return;
    let active = true;
    setResult({ handle, status: 'checking', message: 'Checking availability…' });
    const timer = setTimeout(() => {
      void (check ? check(handle) : Promise.resolve('unavailable' as const)).then(value => {
        if (active) setResult({ handle, status: value === 'available' ? 'available' : 'unavailable', message: value === 'available' ? 'This address is available.' : value === 'taken' ? 'This address is already taken.' : 'Address editing is unavailable. Your existing link still works.' });
      }).catch(error => { if (active) setResult({ handle, status: 'error', message: error instanceof Error ? error.message : 'Could not check this address. Try editing it again.' }); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [enabled, handle, address, check]);
  return immediateAddressValidation(handle, address) ?? (result?.handle === handle ? result : { handle, status: 'checking' as const, message: 'Checking availability…' });
}
