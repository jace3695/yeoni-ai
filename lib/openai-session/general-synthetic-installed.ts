import {createSyntheticInstallation} from './general-synthetic-installation.ts';
// No network, secret resolution or DB construction during import/build. Explicit flags
// and a bounded server-only trial config are required on each request.
export const INSTALLED_SYNTHETIC_SERVER=createSyntheticInstallation(process.env);
