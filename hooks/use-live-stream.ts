"use client";

import { useEffect, useRef } from "react";
import type { LiveTopic, LiveTopicPayloads } from "@/lib/queries/live-types";

type TopicListener = (payload: unknown) => void;

const topicListeners = new Map<LiveTopic, Set<TopicListener>>();
let sharedEventSource: EventSource | null = null;
let registeredTopics = new Set<LiveTopic>();
let closeTimeout: number | undefined;

function dispatch(topic: LiveTopic, messageEvent: Event) {
  const payload: unknown = JSON.parse((messageEvent as MessageEvent<string>).data);
  for (const listener of topicListeners.get(topic) ?? []) listener(payload);
}

function subscribe(topic: LiveTopic, listener: TopicListener) {
  window.clearTimeout(closeTimeout);
  const listeners = topicListeners.get(topic) ?? new Set<TopicListener>();
  listeners.add(listener);
  topicListeners.set(topic, listeners);
  if (!sharedEventSource) {
    sharedEventSource = new EventSource("/api/stream");
    registeredTopics = new Set();
  }
  if (!registeredTopics.has(topic)) {
    sharedEventSource.addEventListener(topic, (messageEvent) => dispatch(topic, messageEvent));
    registeredTopics.add(topic);
  }
}

function unsubscribe(topic: LiveTopic, listener: TopicListener) {
  topicListeners.get(topic)?.delete(listener);
  const hasListeners = [...topicListeners.values()].some((listeners) => listeners.size > 0);
  if (hasListeners) return;
  closeTimeout = window.setTimeout(() => {
    sharedEventSource?.close();
    sharedEventSource = null;
  }, 2000);
}

/**
 * Subscribes to one topic of the shared `/api/stream` EventSource (one connection per tab, no
 * matter how many components listen). The handler may change between renders without
 * resubscribing.
 *
 * @example
 * useLiveStream("system", (sample) => chartHandle.current?.push(sample));
 */
export function useLiveStream<Topic extends LiveTopic>(topic: Topic, handleMessage: (payload: LiveTopicPayloads[Topic]) => void) {
  const handlerReference = useRef(handleMessage);
  useEffect(() => {
    handlerReference.current = handleMessage;
  });
  useEffect(() => {
    const listener: TopicListener = (payload) => handlerReference.current(payload as LiveTopicPayloads[Topic]);
    subscribe(topic, listener);
    return () => unsubscribe(topic, listener);
  }, [topic]);
}
