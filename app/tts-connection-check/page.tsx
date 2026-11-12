import { notFound } from 'next/navigation';
import AuthGate from '../components/AuthGate';
import ConnectionCheck from './ConnectionCheck';
import { ZEPHYR_PREVIEW_BRANCH, ZEPHYR_PREVIEW_ORIGIN } from '@/lib/zephyr-28-wrappers';

export const dynamic = 'force-dynamic';
export default function ConnectionCheckPage() {
  if (process.env.VERCEL_ENV !== 'preview'
    || process.env.VERCEL_GIT_COMMIT_REF !== ZEPHYR_PREVIEW_BRANCH
    || process.env.YEONI_ZEPHYR_28_ONCE_ENABLED !== '1'
    || process.env.YEONI_ZEPHYR_28_TRUSTED_ORIGIN !== ZEPHYR_PREVIEW_ORIGIN) notFound();
  return <AuthGate><ConnectionCheck /></AuthGate>;
}
