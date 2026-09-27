"use client";

import { createContext } from "react";

import type { PublicStoryNode } from "./definition";

/**
 * Exams send a story node by node. The exam shell provides this per question: it asks
 * the server for the nodes along `path` (the server re-walks it before answering).
 */
export type StoryLoader = (path: string[]) => Promise<PublicStoryNode[] | null>;

export const StoryLoaderContext = createContext<StoryLoader | null>(null);
