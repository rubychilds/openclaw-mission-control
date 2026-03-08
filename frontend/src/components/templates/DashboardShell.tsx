"use client";

import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { useAuth } from "@/auth/clerk";

import { ApiError } from "@/api/mutator";
import {
  type listAgentsApiV1AgentsGetResponse,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type listBoardGroupsApiV1BoardGroupsGetResponse,
  useListBoardGroupsApiV1BoardGroupsGet,
} from "@/api/generated/board-groups/board-groups";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type listGatewaysApiV1GatewaysGetResponse,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import {
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
} from "@/api/generated/users/users";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { useTopNavActionsValue } from "@/components/providers/TopNavActionsProvider";
import { isOnboardingComplete } from "@/lib/onboarding";

const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  activity: "Live feed",
  approvals: "Approvals",
  organization: "Teams",
  gateways: "Gateways",
  agents: "Agents",
  boards: "Boards",
  "board-groups": "Board groups",
  "custom-fields": "Custom fields",
  skills: "Skills",
  marketplace: "Marketplace",
  packs: "Packs",
  new: "New",
  edit: "Edit",
  settings: "Settings",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Breadcrumbs() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), retry: false } });

  const groupsQuery = useListBoardGroupsApiV1BoardGroupsGet<
    listBoardGroupsApiV1BoardGroupsGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), retry: false } });

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), retry: false } });

  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), retry: false } });

  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    const boards =
      boardsQuery.data?.status === 200 ? boardsQuery.data.data.items : [];
    const groups =
      groupsQuery.data?.status === 200 ? groupsQuery.data.data.items : [];
    const agents =
      agentsQuery.data?.status === 200 ? agentsQuery.data.data.items : [];
    const gateways =
      gatewaysQuery.data?.status === 200 ? gatewaysQuery.data.data.items : [];
    for (const b of boards) map.set(b.id, b.name);
    for (const g of groups) map.set(g.id, g.name);
    for (const a of agents) map.set(a.id, a.name);
    for (const gw of gateways) map.set(gw.id, gw.name);
    return map;
  }, [boardsQuery.data, groupsQuery.data, agentsQuery.data, gatewaysQuery.data]);

  const crumbs = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((segment, i) => {
      const href = "/" + segments.slice(0, i + 1).join("/");
      let label: string;
      if (UUID_RE.test(segment)) {
        label = nameMap.get(segment) ?? "...";
      } else {
        label =
          BREADCRUMB_LABELS[segment] ??
          segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }
      const isLast = i === segments.length - 1;
      return { href, label, isLast };
    });
  }, [pathname, nameMap]);

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          )}
          {crumb.isLast ? (
            <span className="font-medium text-slate-900">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-slate-500 transition hover:text-slate-700"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const isOnboardingPath = pathname === "/onboarding";
  const topNavActions = useTopNavActionsValue();

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn) && !isOnboardingPath,
      retry: false,
      refetchOnMount: "always",
    },
  });
  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;

  useEffect(() => {
    if (!isSignedIn || isOnboardingPath) return;
    if (!profile) return;
    if (!isOnboardingComplete(profile)) {
      router.replace("/onboarding");
    }
  }, [isOnboardingPath, isSignedIn, profile, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "openclaw_org_switch" || !event.newValue) return;
      window.location.reload();
    };

    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("org-switch");
      channel.onmessage = () => {
        window.location.reload();
      };
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, []);

  if (isOnboardingPath) {
    return (
      <div className="min-h-screen bg-app text-strong">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-app text-strong">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <Breadcrumbs />
          {topNavActions ? (
            <div className="flex items-center gap-3">{topNavActions}</div>
          ) : null}
        </header>
        <div className="flex-1 bg-slate-50">
          {children}
        </div>
      </div>
    </div>
  );
}
