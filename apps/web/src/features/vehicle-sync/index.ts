// Public surface of vehicle-sync. Other features/routes import from here,
// never reaching into ./data, ./hooks directly (same convention as
// identity-bridge/network-authorization/tenant-directory/network-connections).
export type { OwnTenantVehicle } from "./data/vehicle-queries";
export { fetchOwnTenantVehicles } from "./data/vehicle-queries";
export { useOwnTenantVehicles } from "./hooks/useOwnTenantVehicles";
