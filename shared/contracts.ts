export type ResourceKind = 'standard' | 'dataset' | 'artifact_batch' | 'scoring_batch' | 'analysis' | 'template' | 'reference' | 'report' | 'skill';
export type Intent = 'standard' | 'dataset' | 'evaluate' | 'analyze' | 'report' | 'chat';
export type RunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'cancelled' | 'interrupted' | 'failed';
export interface Project { id: string; name: string; createdAt: string }
export interface ResourceVersion {
 id: string; resourceId: string; projectId: string; kind: ResourceKind; title: string;
 version: number; versionLabel: string | null; hash: string; createdAt: string;
 source: { type: 'text'|'file'|'url'|'generated'|'builtin'|'historical'; name?: string; url?: string; revision?: string; retrievedAt?: string };
 text: string; mime: string; byteSize: number; metadata: Record<string, unknown>;
}
export interface ResourceRef { versionId: string; hash?: string; selector?: string }
export interface GoalMode { objective:string; tokenBudget?:number|null; deadlineSeconds?:number|null; maxTurns?:number|null; origin:'user'|'automatic' }
export interface Task { id:string; projectId:string; title:string; intent:Intent; createdAt:string; updatedAt:string; threadId:string|null }
export interface Message { id:string; taskId:string; role:'user'|'assistant'|'system'; text:string; refs:ResourceRef[]; runId:string|null; createdAt:string }
export interface MessagePart { id:string; text:string; phase?:string; at?:string }
export interface TaskContract {
 id:string; taskId:string; userText:string; intent:Intent; goal:string; refs:ResourceRef[];
 assumptions:string[]; openQuestions:string[]; deliverables:string[]; allowedActions:string[];
 finalPrompt:string; skillVersionIds?:string[]; goalMode?:GoalMode|null; createdAt:string;
}
export interface Run { id:string; taskId:string; contractId:string; status:RunStatus; model:string|null; effort:string|null; threadId:string|null; turnId:string|null; error:string|null; createdAt:string; updatedAt:string; goalMode?:GoalMode|null; goalState?:Record<string,unknown>|null; turnCount?:number; stopReason?:string; validationStatus?:'not_checked'|'passed'|'failed' }
export interface RunEvent { id:number; taskId:string; runId:string; kind:string; data:Record<string,unknown>; createdAt:string }
export interface Memory { id:string; projectId:string|null; scope:'user'|'project'; content:string; source:string; active:boolean; revision:number; createdAt:string; updatedAt:string }
export interface Artifact { id:string; taskId:string; runId:string; name:string; mime:string; byteSize:number; hash:string; createdAt:string; url:string; title?:string; kind?:ResourceKind; resourceId?:string; versionId?:string; version?:number; registrationStatus?:'registered'|'unregistered'|'failed'; registrationError?:string|null }
export interface RuntimeModel { id:string; label:string; defaultEffort:string|null; efforts:string[]; inputModalities:string[]; isDefault:boolean }

