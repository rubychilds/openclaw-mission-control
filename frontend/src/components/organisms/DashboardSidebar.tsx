"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  LayoutGrid,
  MessageSquare,
  Network,
  Plus,
  Settings,
  Store,
  Users,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import {
  type listBoardsApiV1BoardsGetResponse,
  getListBoardsApiV1BoardsGetQueryKey,
  useListBoardsApiV1BoardsGet,
  useUpdateBoardApiV1BoardsBoardIdPatch,
} from "@/api/generated/boards/boards";
import {
  type listBoardGroupsApiV1BoardGroupsGetResponse,
  useListBoardGroupsApiV1BoardGroupsGet,
} from "@/api/generated/board-groups/board-groups";
import type { BoardRead } from "@/api/generated/model";
import { OrgSwitcher } from "@/components/organisms/OrgSwitcher";
import { UserMenu } from "@/components/organisms/UserMenu";
import { cn } from "@/lib/utils";

const COLLAPSED_LIMIT = 3;
const UNGROUPED_ID = "__ungrouped__";

export function DashboardSidebar() {
  const pathname = usePathname();
  const isOrgSettings =
    pathname === "/organization" ||
    pathname.startsWith("/gateways") ||
    pathname.startsWith("/custom-fields");
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  const healthQuery = useHealthzHealthzGet<healthzHealthzGetResponse, ApiError>(
    {
      query: {
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: false,
      },
      request: { cache: "no-store" },
    },
  );

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 30_000,
      refetchOnMount: "always",
      retry: false,
    },
  });

  const groupsQuery = useListBoardGroupsApiV1BoardGroupsGet<
    listBoardGroupsApiV1BoardGroupsGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 30_000,
      refetchOnMount: "always",
      retry: false,
    },
  });

  const updateBoard = useUpdateBoardApiV1BoardsBoardIdPatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListBoardsApiV1BoardsGetQueryKey(),
        });
      },
    },
  });

  const boards =
    boardsQuery.data?.status === 200 ? boardsQuery.data.data.items : [];
  const groups =
    groupsQuery.data?.status === 200 ? groupsQuery.data.data.items : [];

  // Group boards by board_group_id
  const groupedBoards = new Map<string, BoardRead[]>();
  const ungrouped: BoardRead[] = [];
  for (const board of boards) {
    if (board.board_group_id) {
      const list = groupedBoards.get(board.board_group_id) ?? [];
      list.push(board);
      groupedBoards.set(board.board_group_id, list);
    } else {
      ungrouped.push(board);
    }
  }

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, board: BoardRead) => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ boardId: board.id, fromGroup: board.board_group_id }),
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroup(groupId);
  };

  const handleDragLeave = (e: React.DragEvent, groupId: string) => {
    // Only clear if leaving the group container (not entering a child)
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    if (dragOverGroup === groupId) {
      setDragOverGroup(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    setDragOverGroup(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const boardId = data.boardId as string;
      const fromGroup = (data.fromGroup as string | null) ?? UNGROUPED_ID;
      if (fromGroup === targetGroupId) return;
      const newGroupId = targetGroupId === UNGROUPED_ID ? null : targetGroupId;
      updateBoard.mutate({ boardId, data: { board_group_id: newGroupId } });
    } catch {
      // Ignore invalid drag data
    }
  };

  const okValue = healthQuery.data?.data?.ok;
  const systemStatus: "unknown" | "operational" | "degraded" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";
  const statusLabel =
    systemStatus === "operational"
      ? "All systems operational"
      : systemStatus === "unknown"
        ? "System status unavailable"
        : "System degraded";

  const renderBoardLink = (board: BoardRead) => (
    <div
      key={board.id}
      draggable
      onDragStart={(e) => handleDragStart(e, board)}
      className="group/drag"
    >
      <Link
        href={`/boards/${board.id}`}
        className={cn(
          "flex items-center gap-2 rounded-lg px-1.5 py-2 text-[13px] text-slate-700 transition",
          pathname.startsWith(`/boards/${board.id}`)
            ? "bg-blue-100 text-blue-800 font-medium"
            : "hover:bg-slate-100",
        )}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 cursor-grab group-hover/drag:opacity-100 transition-opacity" />
        <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{board.name}</span>
      </Link>
    </div>
  );

  const renderBoardSection = (
    sectionId: string,
    sectionBoards: BoardRead[],
  ) => {
    const isExpanded = expandedGroups.has(sectionId);
    const hasMore = sectionBoards.length > COLLAPSED_LIMIT;
    const visible = isExpanded
      ? sectionBoards
      : sectionBoards.slice(0, COLLAPSED_LIMIT);
    const remaining = sectionBoards.length - COLLAPSED_LIMIT;

    return (
      <div className="mt-1 space-y-0.5">
        {visible.map(renderBoardLink)}
        {hasMore ? (
          <button
            type="button"
            onClick={() => toggleGroup(sectionId)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:text-slate-600"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                isExpanded && "rotate-180",
              )}
            />
            {isExpanded ? "Show less" : `${remaining} more`}
          </button>
        ) : null}
      </div>
    );
  };

  const renderDropZone = (
    groupId: string,
    label: string,
    sectionBoards: BoardRead[],
  ) => (
    <div
      key={groupId}
      onDragOver={(e) => handleDragOver(e, groupId)}
      onDragLeave={(e) => handleDragLeave(e, groupId)}
      onDrop={(e) => handleDrop(e, groupId)}
      className={cn(
        "rounded-lg py-1 transition-colors",
        dragOverGroup === groupId && "bg-blue-50 ring-1 ring-blue-200",
      )}
    >
      <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      {sectionBoards.length > 0 ? (
        renderBoardSection(groupId, sectionBoards)
      ) : (
        <p className="mt-1 px-3 py-1 text-xs text-slate-300">No boards</p>
      )}
    </div>
  );

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-1 pb-3">
          <OrgSwitcher />
        </div>
        <nav className="mt-1 space-y-4 text-sm">
          {isOrgSettings ? (
            <>
              {/* Back to main nav */}
              <div>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Link>
              </div>

              {/* Org settings nav */}
              <div>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Organization
                </p>
                <div className="mt-1 space-y-1">
                  <Link
                    href="/organization"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                      pathname === "/organization"
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Users className="h-4 w-4" />
                    Teams
                  </Link>
                  <Link
                    href="/gateways"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                      pathname.startsWith("/gateways")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Network className="h-4 w-4" />
                    Gateways
                  </Link>
                  <Link
                    href="/custom-fields"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                      pathname.startsWith("/custom-fields")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Settings className="h-4 w-4" />
                    Custom fields
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Overview */}
              <div>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Overview
                </p>
                <div className="mt-1 space-y-1">
                  <Link
                    href="/dashboard"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                      pathname === "/dashboard"
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <BarChart3 className="h-4 w-4" />
                    Dashboard
                  </Link>
                  <Link
                    href="/activity"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                      pathname.startsWith("/activity")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Activity className="h-4 w-4" />
                    Live feed
                  </Link>
                  <Link
                    href="/approvals"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                      pathname.startsWith("/approvals")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approvals
                  </Link>
                  <Link
                    href="/chat"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                      pathname === "/chat"
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </Link>
                </div>
              </div>

              {/* Skills & Agents */}
              {isAdmin ? (
                <div>
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Skills & Agents
                  </p>
                  <div className="mt-1 space-y-1">
                    <Link
                      href="/agents"
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                        pathname.startsWith("/agents")
                          ? "bg-blue-100 text-blue-800 font-medium"
                          : "hover:bg-slate-100",
                      )}
                    >
                      <Bot className="h-4 w-4" />
                      Agents
                    </Link>
                    <Link
                      href="/skills/marketplace"
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                        pathname === "/skills" ||
                          pathname.startsWith("/skills/marketplace")
                          ? "bg-blue-100 text-blue-800 font-medium"
                          : "hover:bg-slate-100",
                      )}
                    >
                      <Store className="h-4 w-4" />
                      Marketplace
                    </Link>
                    <Link
                      href="/skills/packs"
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 transition",
                        pathname.startsWith("/skills/packs")
                          ? "bg-blue-100 text-blue-800 font-medium"
                          : "hover:bg-slate-100",
                      )}
                    >
                      <Boxes className="h-4 w-4" />
                      Packs
                    </Link>
                  </div>
                </div>
              ) : null}

              {/* Board groups with boards (drop zones) */}
              {groups.map((group) =>
                renderDropZone(
                  group.id,
                  group.name,
                  groupedBoards.get(group.id) ?? [],
                ),
              )}

              {/* Ungrouped boards (drop zone) */}
              {renderDropZone(UNGROUPED_ID, "Ungrouped", ungrouped)}

              {/* New board + New group */}
              <div className="space-y-2">
                <Link
                  href="/board-groups/new"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-slate-400 transition hover:text-slate-600 hover:bg-slate-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New group
                </Link>
                <Link
                  href="/boards/new"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  New board
                </Link>
              </div>
            </>
          )}
        </nav>
      </div>
      <div className="border-t border-slate-200 px-3 py-3">
        <div className="flex items-center gap-2 px-1">
          <UserMenu />
        </div>
        <div className="mt-2 flex items-center gap-2 px-1 text-xs text-slate-500">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              systemStatus === "operational" && "bg-emerald-500",
              systemStatus === "degraded" && "bg-rose-500",
              systemStatus === "unknown" && "bg-slate-300",
            )}
          />
          {statusLabel}
        </div>
      </div>
    </aside>
  );
}
