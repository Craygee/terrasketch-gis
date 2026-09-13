import { useState } from "react";
import { Database, Search } from "lucide-react";
import { weatherProviderRegistry } from "@/lib/weather/providerRegistry";
import { weatherProductRegistry } from "@/lib/weather/productRegistry";
import type { WeatherBundle } from "@/lib/weather/types";
import type { XweatherConnectionStatus } from "@/lib/weather/xweatherConnection";

export function WeatherDataSources({
  bundle,
  xweatherConnection,
  onManageXweather,
}: {
  bundle: WeatherBundle | null;
  xweatherConnection: XweatherConnectionStatus;
  onManageXweather: () => void;
}) {
  const [search, setSearch] = useState("");
  const groups = [
    {
      name: "Included / Public",
      test: (id: string) =>
        weatherProviderRegistry.find((item) => item.provider_id === id)?.commercial_use_status ===
        "permitted",
    },
    { name: "User connected / BYOK", test: (id: string) => id === "xweather" },
    {
      name: "Optional providers / License review",
      test: (id: string) =>
        id !== "xweather" &&
        weatherProviderRegistry.find((item) => item.provider_id === id)?.commercial_use_status !==
          "permitted",
    },
  ];
  return (
    <section aria-label="Weather Data Sources" className="space-y-4 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Database className="size-4" />
        Settings · Data Sources
      </h2>
      <p className="text-xs text-muted-foreground">
        Manage provider access and review source, licensing and connection status.
      </p>
      {bundle?.providerControls?.configurationValid === false && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-xs">
          Provider policy is invalid. Commercial access is disabled; contact the deployment
          administrator.
        </p>
      )}
      <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
        <Search className="size-4" />
        <input
          aria-label="Search data sources"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search data sources"
          className="min-w-0 flex-1 bg-transparent text-sm"
        />
      </label>
      {groups.map((group) => (
        <details key={group.name} open className="rounded-xl border border-border">
          <summary className="cursor-pointer p-3 text-xs font-semibold">{group.name}</summary>
          <div className="space-y-2 px-3 pb-3">
            {weatherProviderRegistry
              .filter(
                (item) =>
                  group.test(item.provider_id) &&
                  item.provider_name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((provider) => {
                const products = weatherProductRegistry.filter(
                  (item) => item.providerId === provider.provider_id,
                );
                const disabled = bundle?.providerControls?.disabledProviders.includes(
                  provider.provider_id,
                );
                const isXweather = provider.provider_id === "xweather";
                const status = disabled
                  ? "Disabled by administrator"
                  : provider.provider_id === "landdraft"
                    ? "Private workspace / explicit sharing"
                    : isXweather && xweatherConnection.approvedProducts?.length
                      ? "Product-specific license approval recorded"
                      : provider.commercial_use_status === "permitted"
                        ? "Included · availability varies by product"
                        : "LICENSE REVIEW REQUIRED";
                return (
                  <details
                    key={provider.provider_id}
                    className="rounded-xl bg-secondary p-3 text-xs"
                  >
                    <summary className="cursor-pointer font-semibold">
                      {provider.provider_name}
                      <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                        {status}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2">
                      <p>{provider.notes}</p>
                      <p>{provider.attribution_requirement}</p>
                      <p>
                        Review: {provider.last_license_reviewed_at ?? "Pending"} · Registered
                        products: {products.length}
                      </p>
                      <p>
                        Managed access:{" "}
                        {provider.LandDraft_managed_credentials_allowed === true
                          ? "Permitted under recorded terms"
                          : "Requires an approved agreement and server configuration"}
                      </p>
                      <p>
                        Cache permission: {String(provider.caching_allowed)} ·{" "}
                        {provider.maximum_cache_duration === null
                          ? "No retention limit verified"
                          : `${provider.maximum_cache_duration} seconds`}
                      </p>
                      {isXweather && (
                        <div className="space-y-2 border-t border-border pt-2">
                          <p>
                            Connection:{" "}
                            {xweatherConnection.connected
                              ? "Credentials saved"
                              : xweatherConnection.state === "loading"
                                ? "Checking…"
                                : "Not connected"}
                          </p>
                          <p>
                            Product entitlements:{" "}
                            {xweatherConnection.verifiedProducts?.join(", ") ||
                              "Not verified in this session"}
                          </p>
                          {xweatherConnection.lastSuccessfulRequest && (
                            <p>
                              Last successful request:{" "}
                              {new Date(xweatherConnection.lastSuccessfulRequest).toLocaleString()}
                            </p>
                          )}
                          {xweatherConnection.error && (
                            <p role="status">{xweatherConnection.error}</p>
                          )}
                          <button
                            type="button"
                            onClick={onManageXweather}
                            className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
                          >
                            {xweatherConnection.connected
                              ? "Manage / Test / Disconnect"
                              : "Connect Xweather"}
                          </button>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 text-primary">
                        <a
                          href={provider.official_documentation_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Documentation
                        </a>
                        <a href={provider.terms_url} target="_blank" rel="noreferrer">
                          Terms / licensing
                        </a>
                      </div>
                    </div>
                  </details>
                );
              })}
          </div>
        </details>
      ))}
      <details className="rounded-xl border border-border p-3 text-xs">
        <summary className="cursor-pointer font-semibold">Live provider health</summary>
        {!bundle && <p className="mt-2">Inspect a map point to load provider status.</p>}
        {bundle?.providerHealth.map((provider) => (
          <div key={provider.providerId} className="mt-3 border-t border-border pt-2">
            <strong>
              {provider.providerName} · {provider.status}
            </strong>
            <p>{provider.coverage}</p>
            {provider.lastSuccessfulRequest && (
              <p>
                Last successful request: {new Date(provider.lastSuccessfulRequest).toLocaleString()}
              </p>
            )}
            {provider.lastUpdate && (
              <p>Product valid/update time: {new Date(provider.lastUpdate).toLocaleString()}</p>
            )}
            {provider.error && <p>{provider.error}</p>}
          </div>
        ))}
      </details>
    </section>
  );
}
