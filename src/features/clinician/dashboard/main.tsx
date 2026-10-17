import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../styles.css';
import ClinicianDashboard from '../ClinicianDashboard';
createRoot(document.getElementById('root')!).render(<StrictMode><ClinicianDashboard/></StrictMode>);
