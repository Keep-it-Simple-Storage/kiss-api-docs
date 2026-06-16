import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "reference/kiss-api-reference",
    },
    {
      type: "category",
      label: "Units",
      items: [
        {
          type: "doc",
          id: "reference/v-2-units-show",
          label: "Get a unit",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "reference/v-2-units-index",
          label: "List units",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "reference/v-2-units-sync",
          label: "Bulk upsert units",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "reference/v-2-units-tenancy-put",
          label: "Assign the unit's primary user",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "reference/v-2-units-tenancy-delete",
          label: "Remove the unit's primary user",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "reference/v-2-units-patch",
          label: "Update unit facts",
          className: "api-method patch",
        },
      ],
    },
    {
      type: "category",
      label: "Logs",
      items: [
        {
          type: "doc",
          id: "reference/v-2-locks-logs-store",
          label: "Report lock activity",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "reference/v-2-entry-points-logs-store",
          label: "Report entry-point activity",
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
          id: "reference/v-2-health",
          label: "Health check",
          className: "api-method get",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
