import { createContext, useContext } from 'react'

/**
 * Whether this account has the whole hub, as the server reported it.
 *
 * The answer is fetched once at sign-in and used in two places: the sidebar,
 * which hides what cannot be used, and a few controls inside pages everyone
 * can see - on the map, starting a research run and downloading its data are
 * for full-access accounts only. A context rather than a prop because the map
 * sits three components below where the answer lives.
 *
 * Cosmetic only: the server enforces the same rule and 403s regardless.
 */
const FullAccessContext = createContext<boolean>(false)

export const FullAccessProvider = FullAccessContext.Provider

export function useFullAccess() {
  return useContext(FullAccessContext)
}
