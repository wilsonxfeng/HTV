import { create } from 'zustand';
import { isCompletedPractice } from './garden';
import type { MotionSession } from './types';
import { listSessions, saveSession, deleteSession } from './storage';
export type Page = 'home' | 'exercise' | 'studio' | 'history' | 'about' | 'garden' | 'progress';
interface AppState {
  gardenReward: string | null; clearGardenReward:()=>void; page: Page; session: MotionSession | null; sessions: MotionSession[]; notice: string | null; ready:boolean;
  navigate:(page:Page)=>void; openSession:(session:MotionSession)=>void;
  load:()=>Promise<void>; save:(session:MotionSession)=>Promise<void>; remove:(id:string)=>Promise<void>; clearNotice:()=>void;
}
export const useApp = create<AppState>((set, get) => ({
  gardenReward:null,clearGardenReward:()=>set({gardenReward:null}),page:'home',session:null,sessions:[],notice:null,ready:false,
  navigate:page=>set({page}),openSession:session=>set({session,page:'studio'}), clearNotice:()=>set({notice:null}),
  load:async()=>{try{set({sessions:await listSessions(),ready:true});}catch{set({notice:'Local storage is unavailable. You can still record and export your session.',ready:true});}},
  save:async session=>{try{const before=await listSessions();const newFlower=isCompletedPractice(session)&&!before.some(saved=>saved.id===session.id&&isCompletedPractice(saved));await saveSession(session);set({sessions:await listSessions(),gardenReward:newFlower?session.id:get().gardenReward,notice:newFlower?'Session saved. A flower grew.':'Session saved.'});}catch{set({notice:'This session could not be saved. Export it from the studio to keep a copy.'});}},
  remove:async id=>{try{const current=get().sessions.find(s=>s.id===id);if(current?.trackingMode==='pose'){const [{bodyRecordingStore},{echoRepository}]=await Promise.all([import('../features/body-tracking/bodyRecordingStore'),import('../features/movement-echoes/repository')]);await bodyRecordingStore.remove(id);await echoRepository.delete(id);}await deleteSession(id);const sessions=await listSessions();set(state=>({sessions,session:state.session?.id===id?null:state.session,notice:'Session deleted.'}));}catch{set({notice:'Couldn’t delete session. Try again.'});}}
}));
