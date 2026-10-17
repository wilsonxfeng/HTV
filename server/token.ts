import { loadConfig } from './config';
import { issueToken } from './auth';
const config = await loadConfig();
const [role, subject, ...patientIds] = process.argv.slice(2);
if (!['patient', 'clinician'].includes(role) || !subject || !patientIds.length) throw Error('Usage: npm run api:token -- patient|clinician SUBJECT PATIENT_UUID [PATIENT_UUID...]');
console.log(await issueToken(config.secret, { sub: subject, role: role as 'patient' | 'clinician', patientIds }));
