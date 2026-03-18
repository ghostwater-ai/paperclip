import { useState } from "react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";
import type { Issue, Agent } from "@paperclipai/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "@/api/issues";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
// We'll use simple cron description instead of external libraries

interface SchedulesListProps {
  schedules: Issue[];
  isLoading: boolean;
  error: Error | null;
  projectId: string;
  companyId: string;
  agents: Agent[] | undefined;
}

function parseSchedule(schedule: string | null, timezone: string | null): string {
  if (!schedule) return "Not scheduled";

  try {
    // Check if it's an ISO datetime (one-shot schedule)
    const date = new Date(schedule);
    if (!isNaN(date.getTime()) && schedule.includes("T")) {
      return `Once at ${date.toLocaleString()} ${timezone ? `(${timezone})` : ""}`;
    }

    // Simple cron description - we'll just show the raw cron for now
    // In a real implementation, you might want to parse this more nicely
    return `${schedule} ${timezone ? `(${timezone})` : ""}`;
  } catch {
    return `${schedule} ${timezone ? `(${timezone})` : ""}`;
  }
}

function getNextRun(schedule: string | null, scheduleNextRunAt: Date | null): string {
  if (!schedule) return "—";

  if (scheduleNextRunAt) {
    return timeAgo(new Date(scheduleNextRunAt));
  }

  try {
    // Check if it's an ISO datetime (one-shot schedule)
    const date = new Date(schedule);
    if (!isNaN(date.getTime()) && schedule.includes("T")) {
      return timeAgo(date);
    }
  } catch {
    // Ignore parsing errors
  }

  return "Calculating...";
}

function ScheduleToggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        enabled ? "bg-green-600" : "bg-muted",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      aria-label={enabled ? "Disable schedule" : "Enable schedule"}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
          enabled ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function SchedulesList({
  schedules,
  isLoading,
  error,
  projectId,
  companyId,
  agents,
}: SchedulesListProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Issue | null>(null);

  const updateSchedule = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "schedules"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      pushToast({
        title: "Schedule updated",
        tone: "success",
      });
    },
    onError: () => {
      pushToast({
        title: "Failed to update schedule",
        tone: "error",
      });
    },
  });

  const createSchedule = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      issuesApi.create(companyId, { ...data, projectId, isTemplate: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "schedules"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      setCreateDialogOpen(false);
      pushToast({
        title: "Schedule created",
        tone: "success",
      });
    },
    onError: () => {
      pushToast({
        title: "Failed to create schedule",
        tone: "error",
      });
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading schedules...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">Error loading schedules: {error.message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Scheduled Tasks</h2>
          <p className="text-sm text-muted-foreground">
            Automate recurring work by creating scheduled task templates
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm">
          New Schedule
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No scheduled tasks yet. Create your first scheduled task to automate recurring work.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)} variant="outline">
            Create Scheduled Task
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left text-sm font-medium px-4 py-3">Task</th>
                <th className="text-left text-sm font-medium px-4 py-3">Schedule</th>
                <th className="text-left text-sm font-medium px-4 py-3">Next Run</th>
                <th className="text-left text-sm font-medium px-4 py-3">Assignee</th>
                <th className="text-center text-sm font-medium px-4 py-3">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => {
                const agent = agents?.find((a) => a.id === schedule.assigneeAgentId);
                return (
                  <tr key={schedule.id} className="border-b hover:bg-muted/25 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/issues/${schedule.identifier ?? schedule.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {schedule.title}
                      </Link>
                      {schedule.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {schedule.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">
                        {parseSchedule(schedule.schedule, schedule.scheduleTimezone)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {getNextRun(schedule.schedule, schedule.scheduleNextRunAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {agent ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={agent.icon || undefined} />
                            <AvatarFallback className="text-xs">
                              {agent.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{agent.name}</span>
                        </div>
                      ) : schedule.assigneeUserId ? (
                        <span className="text-sm text-muted-foreground">User assigned</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScheduleToggle
                        enabled={schedule.scheduleEnabled}
                        onChange={(enabled) =>
                          updateSchedule.mutate({ id: schedule.id, data: { scheduleEnabled: enabled } })
                        }
                        disabled={updateSchedule.isPending}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateScheduleDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        agents={agents}
        onCreate={createSchedule.mutate}
        isPending={createSchedule.isPending}
      />
    </div>
  );
}

function CreateScheduleDialog({
  open,
  onOpenChange,
  agents,
  onCreate,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[] | undefined;
  onCreate: (data: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState("");
  const [scheduleType, setScheduleType] = useState<"cron" | "oneshot">("cron");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [assigneeAgentId, setAssigneeAgentId] = useState("");
  const [enabled, setEnabled] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      title,
      description,
      schedule,
      scheduleTimezone: timezone,
      scheduleEnabled: enabled,
      assigneeAgentId: assigneeAgentId || null,
      status: "todo",
      priority: "medium",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Scheduled Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Weekly team sync"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this task should accomplish..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Schedule Type</Label>
            <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as "cron" | "oneshot")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">Recurring (Cron Expression)</SelectItem>
                <SelectItem value="oneshot">One-time (Specific Date)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule">
              {scheduleType === "cron" ? "Cron Expression" : "Date & Time"}
            </Label>
            {scheduleType === "cron" ? (
              <Input
                id="schedule"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="e.g., 0 9 * * MON (Every Monday at 9am)"
                required
              />
            ) : (
              <Input
                id="schedule"
                type="datetime-local"
                value={schedule}
                onChange={(e) => setSchedule(new Date(e.target.value).toISOString())}
                required
              />
            )}
            <p className="text-xs text-muted-foreground">
              {scheduleType === "cron"
                ? "Use cron syntax: minute hour day month weekday"
                : "One-time schedules will be automatically disabled after running"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g., America/New_York"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignee">Assignee</Label>
            <Select value={assigneeAgentId} onValueChange={setAssigneeAgentId}>
              <SelectTrigger id="assignee">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {agents?.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="enabled">Enable schedule immediately</Label>
            <ScheduleToggle enabled={enabled} onChange={setEnabled} />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !title.trim() || !schedule.trim()}>
              {isPending ? "Creating..." : "Create Schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}