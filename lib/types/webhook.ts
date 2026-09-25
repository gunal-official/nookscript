/** Webhook settings types (Phase: events/webhooks foundation). */

export interface WebhookEndpoint {
  id: string;
  url: string;
  signing_secret: string;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event_id: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
