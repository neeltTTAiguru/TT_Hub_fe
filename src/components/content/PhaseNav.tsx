import { NavLink } from 'react-router-dom'

const PHASES = [
  ['/assistants/content-operations', 'Write'],
  ['/assistants/content-operations/seo', 'SEO'],
  ['/assistants/content-operations/publish', 'Publish'],
] as const

// Always all three, always enabled. The draft travels with you, so moving back
// to an earlier phase to change something is normal work rather than an error.
export default function PhaseNav() {
  return (
    <nav className="phase-nav" aria-label="Article phase">
      {PHASES.map(([to, label], index) => (
        <NavLink
          key={to}
          to={to}
          end={index === 0}
          className={({ isActive }) => `phase-nav-item${isActive ? ' phase-nav-item-active' : ''}`}
        >
          <span className="phase-nav-index">{index + 1}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
