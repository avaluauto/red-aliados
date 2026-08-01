// Wires the create-request data function into a TanStack `useMutation`, per
// design.md's hexagonal-lite split (hooks/ composes data/, components never
// call data/ directly -- same convention as tenant-directory's hooks).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ConnectionRequestRow,
  type CreateConnectionRequestInput,
  createConnectionRequest,
} from "../data/connection-requests-queries";

/**
 * Creates a `vehicle_interest`/`search_match`-origin connection request.
 * On success, invalidates every `network-connections`-scoped query so any
 * list/candidate-link UI reading through this feature refreshes.
 */
export function useCreateConnectionRequest() {
  const queryClient = useQueryClient();

  return useMutation<ConnectionRequestRow, Error, CreateConnectionRequestInput>({
    mutationFn: createConnectionRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["network-connections"] });
    },
  });
}
