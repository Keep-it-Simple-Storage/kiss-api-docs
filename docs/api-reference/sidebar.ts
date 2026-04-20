import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "api-reference/kiss-api",
    },
    {
      type: "category",
      label: "Authentication",
      items: [
        {
          type: "doc",
          id: "api-reference/request-otp",
          label: "Request OTP",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/verify-otp",
          label: "Verify OTP",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Tenant Access",
      items: [
        {
          type: "doc",
          id: "api-reference/get-tenant-access",
          label: "Get tenant access",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Lock Logs",
      items: [
        {
          type: "doc",
          id: "api-reference/create-lock-log",
          label: "Create lock log",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Entry Point Logs",
      items: [
        {
          type: "doc",
          id: "api-reference/create-entry-point-log",
          label: "Create entry point log",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "PMS Events",
      items: [
        {
          type: "doc",
          id: "api-reference/move-in-event",
          label: "Move-in event",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/move-out-event",
          label: "Move-out event",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/patch-unit-facts",
          label: "Update unit facts (sparse)",
          className: "api-method patch",
        },
      ],
    },
    {
      type: "category",
      label: "PMS Sync",
      items: [
        {
          type: "doc",
          id: "api-reference/sync-units",
          label: "Sync units (bulk)",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/register-webhook",
          label: "Register webhook (coming soon)",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Health",
      items: [
        {
          type: "doc",
          id: "api-reference/health-check",
          label: "Health check",
          className: "api-method get",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
