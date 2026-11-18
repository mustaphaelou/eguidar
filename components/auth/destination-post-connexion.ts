export function rejoindreLaDestination(
  destination: string | null,
  onSuccess: () => void
) {
  if (destination) {
    window.location.href = destination
    return
  }
  onSuccess()
}
