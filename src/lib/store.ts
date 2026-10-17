import { create } from 'zustand';
import type { MotionSession } from './types';
import { listSessions, saveSession, deleteSession } from './storage';
export type Page = 'home' | 'exercise' | 'studio' | 'history' | 'about';
interface AppState {
  page: Page; session: MotionSession | null; sessions: MotionSession[]; notice: string | null; ready:boolean;
  navigate:(page:Page)=>void; openSession:(session:MotionSession)=>void;
  load:()=>Promise<void>; save:(session:MotionSession)=>Promise<void>; remove:(id:string)=>Promise<void>; clearNotice:()=>void;
}
export const useApp = create<AppState>((set) => ({
  page:'home',session:null,sessions:[],notice:null,ready:false,
  navigate:page=>set({page}),openSession:session=>set({session,page:'studio'}), clearNotice:()=>set({notice:null}),
  load:async()=>{try{set({sessions:await listSessions(),ready:true});}catch{set({notice:'Local storage is unavailable. You can still record and export your session.',ready:true});}},
  save:async session=>{try{await saveSession(session);set({sessions:await listSessions(),notice:'Session saved on this device.'});}catch{set({notice:'This session could not be saved. Export it from the studio to keep a copy.'});}},
  remove:async id=>{try{await deleteSession(id);const sessions=await listSessions();set(state=>({sessions,session:state.session?.id===id?null:state.session,notice:'Session deleted from this device.'}));}catch{set({notice:'We couldn’t delete that session. Please try again.'});}}
}));
