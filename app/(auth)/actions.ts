"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type CreateWorkspaceResult = { error: string } | undefined;

/**
 * Creates a workspace + owner membership row for the signed-up user.
 * Runs server-side; the actual insert happens inside the SECURITY DEFINER
 * `create_workspace()` RPC (single transaction). The userId passed from the
 * signup response is validated against the server session — never trusted.
 */
export async function createWorkspaceAction(input: {
  workspaceName: string;
  userId: string;
}): Promise<CreateWorkspaceResult> {
  const workspaceName = input.workspaceName?.trim();

  if (!workspaceName) {
    return { error: "Workspace name is required." };
  }
  if (workspaceName.length > 80) {
    return { error: "Workspace name must be 80 characters or fewer." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "Your session has expired. Log in again — you’ll be asked to name your workspace on the way in.",
    };
  }
  if (user.id !== input.userId) {
    return { error: "Signed-in user mismatch. Refresh the page and try again." };
  }

  const { error } = await supabase.rpc("create_workspace", {
    workspace_name: workspaceName,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/intake");
}
