import { createContext, useContext } from 'react'
import type { MemberView } from './api'

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

/**
 * What the command board set for this account, fetched in the same request
 * as the answer above. Null for full-access accounts and for anyone the board
 * has not configured, and the map draws itself as it always did in both cases.
 * Cosmetic in the same way: the server intersects the same scope regardless.
 */
const MemberViewContext = createContext<MemberView | null>(null)

export const MemberViewProvider = MemberViewContext.Provider

export function useMemberView() {
  return useContext(MemberViewContext)
}
