"use client";
import { useTransition } from "react";
import { markNotificationsRead } from "../_actions/common";
export function MarkAllRead() { const [p, start] = useTransition(); return <button className="btn-primary" disabled={p} onClick={() => start(() => markNotificationsRead())}>Mark all read</button>; }
