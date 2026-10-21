import { WorkspaceSwitcher } from "@/components/teams/w-switcher";

/** W7-4: the workspace switcher with the boards' two workspaces. Development and previews only. */
export default function Page() {
  return (
    <div style={{ padding: 8 }}>
      <WorkspaceSwitcher
        workspaces={[
          { id: "c", name: "Corelith", sub: "Pabasa · field worker", current: true },
          { id: "m", name: "Mhlanga Events", sub: "Pabasa · owner", waiting: 5, tone: "dark" },
        ]}
        person={{ name: "Tariro Mhlanga", email: "tariro.mhlanga@gmail.com" }}
      />
    </div>
  );
}
