import {storage} from '../storage.js';const K='social-plan';
export function listSocialTasks(){return storage.get(K,[])}
export function saveSocialTasks(tasks){storage.set(K,tasks.slice(0,500))}
export function addSocialTask(task){const a=listSocialTasks();a.push({id:crypto.randomUUID(),status:'planned',...task});saveSocialTasks(a);return a}