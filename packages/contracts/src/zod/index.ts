// Shared Zod schemas (webhook payloads, entity DTOs) — populated starting
// PR1/PR4 as features are implemented (see design.md — vehicle-sync webhook
// schema, entity DTOs derived from `./db` generated types).
export {
  type VehicleSnapshotStatus,
  type VehicleSyncEvent,
  type VehicleSyncPhoto,
  vehicleSnapshotStatusSchema,
  vehicleSyncEventSchema,
  vehicleSyncPhotoSchema,
} from "./vehicle-sync";
