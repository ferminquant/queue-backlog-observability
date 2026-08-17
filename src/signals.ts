export type Metric = {
  name: string;
  value: number;
  unit?: string;
  timestamp: number;
  labels?: Record<string, string>;
};

export type LogEvent = {
  name: string;
  timestamp: number;
  correlationId: string;
  messageId: string;
  workerId?: string;
  attributes?: Record<string, unknown>;
};

export type Span = {
  spanId: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  correlationId: string;
  messageId: string;
  workerId?: string;
};

export const MetricNames = {
  QueueDepthApproximate: 'QueueDepthApproximate',
  OldestMessageAgeSeconds: 'OldestMessageAgeSeconds',
  WorkerProcessingLatencyMs: 'WorkerProcessingLatencyMs',
  WorkerErrorRate: 'WorkerErrorRate',
  DownstreamLatencyMs: 'DownstreamLatencyMs',
  MessagesReceivedPerMin: 'MessagesReceivedPerMin',
  MessagesDeletedPerMin: 'MessagesDeletedPerMin',
  DlqMessageCount: 'DlqMessageCount',
} as const;

export const LogEventNames = {
  MessageReceived: 'message.received',
  MessageProcessingStarted: 'message.processing.started',
  MessageProcessingCompleted: 'message.processing.completed',
  MessageProcessingFailed: 'message.processing.failed',
  DownstreamCallCompleted: 'downstream.call.completed',
  BacklogThresholdWarning: 'backlog.threshold.warning',
  BacklogThresholdBreached: 'backlog.threshold.breached',
} as const;

export const SpanNames = {
  ApiSubmit: 'api.submit',
  QueueWait: 'queue.wait',
  WorkerProcess: 'worker.process',
  DownstreamCall: 'downstream.call',
} as const;
