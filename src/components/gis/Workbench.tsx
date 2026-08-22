import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { WorkbenchProvider } from "@/lib/gis/store";
import { MapRefProvider } from "@/lib/gis/mapRef";
import { MapCanvas } from "./MapCanvas";
import { LayerPanel } from "./LayerPanel";
import { TopBar } from "./TopBar";
import { SearchBox } from "./SearchBox";
import { BasemapControl } from "./BasemapControl";
import { DrawToolbar } from "./DrawToolbar";
import { AttributeTable } from "./AttributeTable";
import { DataDrawer } from "./DataDrawer";
import { cn } from "@/lib/utils";

export default function Workbench() {
  return (
    <WorkbenchProvider>
      <MapRefProvider>
        <WorkbenchShell />
        <Toaster />
      </MapRefProvider>
    </WorkbenchProvider>
  );
}

function WorkbenchShell() {
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (window.innerWidth < 768) setPanelOpen(false);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <TopBar onTogglePanel={() => setPanelOpen((o) => !o)} panelOpen={panelOpen} />

      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            "absolute inset-y-0 left-0 z-30 w-72 border-r border-border shadow-float transition-transform md:relative md:z-auto md:shadow-none",
            panelOpen ? "translate-x-0" : "-translate-x-full md:hidden",
          )}
        >
          <LayerPanel />
        </aside>

        <main className="relative min-w-0 flex-1">
          <MapCanvas />

          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3">
            <div className="pointer-events-auto flex flex-wrap items-start justify-between gap-2">
              <SearchBox />
              <div className="hidden md:block">
                <DrawToolbar />
              </div>
            </div>
          </div>

          <div className="pointer-events-auto absolute bottom-16 left-1/2 z-20 -translate-x-1/2 md:hidden">
            <DrawToolbar />
          </div>

          <div className="pointer-events-auto absolute bottom-16 right-3 z-20 md:bottom-24">
            <BasemapControl />
          </div>

          <DataDrawer />
        </main>
      </div>

      <AttributeTable />
    </div>
  );
}
