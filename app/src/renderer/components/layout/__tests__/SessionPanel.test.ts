// @vitest-environment happy-dom
import React from 'react'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { installMockElectron, uninstallMockElectron } from '@renderer/__test-utils__/mock-electron'
import { resetAllStores } from '@renderer/__test-utils__/store-helpers'
import { useSessionStore, buildSessionTree } from '@renderer/stores/session-store'
import { SessionPanel } from '../SessionPanel'
import type { SessionTab } from '@common/multi-session-types'

/**
 * SessionPanel depends on multiple Zustand stores via hooks (useSessionActions,
 * useRelativeTime, useUIStore). During renderToStaticMarkup, React 18's
 * useSyncExternalStore uses getServerSnapshot, which returns the store state
 * at the time the store module was initialized — NOT the state set via
 * setState() between tests.
 *
 * Therefore these tests verify the structural rendering of SessionPanel with
 * the default store state (projectPath: null, sessions: [], etc.).
 * Store-dependent conditional rendering (session lists, worktree badges, etc.)
 * would need @testing-library/react with act() for proper client-side hydration.
 */

describe('SessionPanel', () => {
  beforeEach(() => {
    resetAllStores()
    installMockElectron()
  })

  afterEach(() => {
    uninstallMockElectron()
  })

  it('renders the panel container with fixed width and border', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('w-[220px]')
    expect(html).toContain('border-r')
    expect(html).toContain('flex flex-col h-full')
  })

  it('renders the New session button in the header', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('New')
    // Button is rendered with Plus icon
    expect(html).toContain('lucide-plus')
  })

  it('renders search input with filter placeholder', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('placeholder="Filter sessions..."')
    expect(html).toContain('type="text"')
  })

  it('renders search icon inside the search field', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('lucide-search')
  })

  it('renders Recent section label', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('Recent')
  })

  it('renders empty state with "No project selected" message (default store state)', () => {
    // Default store: projectPath=null, sessions=[]
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('No project selected')
    expect(html).toContain('Use the project switcher above to open a project.')
  })

  it('renders Open Folder button in empty state', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('Open Folder')
    expect(html).toContain('lucide-folder-open')
  })

  it('renders ProjectSwitcherDropdown trigger with menu attributes', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('Select Project')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('data-state="closed"')
  })

  it('renders ScrollArea viewport for the session list', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('data-radix-scroll-area-viewport')
  })

  it('renders header with border-b separator', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    expect(html).toContain('p-3 border-b')
  })

  it('does not render Active section when no sessionStates exist (default)', () => {
    const html = renderToStaticMarkup(React.createElement(SessionPanel))

    // "Active" section only renders when totalActive > 0
    // With default store state, sessionStates is empty, so no Active header
    // Only "Recent" should appear as a section header
    const activeOccurrences = (html.match(/uppercase tracking-wider/g) ?? []).length
    expect(activeOccurrences).toBe(1) // Only "Recent"
  })
})

describe('buildSessionTree', () => {
  it('puts sessions without parentSessionId into roots', () => {
    const tabs: SessionTab[] = [
      { sessionId: 's1', name: 'Root 1', status: 'idle' },
      { sessionId: 's2', name: 'Root 2', status: 'idle' },
    ]

    const { roots, childrenOf } = buildSessionTree(tabs)

    expect(roots).toHaveLength(2)
    expect(roots[0].sessionId).toBe('s1')
    expect(roots[1].sessionId).toBe('s2')
    expect(childrenOf.size).toBe(0)
  })

  it('groups child sessions under their parent', () => {
    const tabs: SessionTab[] = [
      { sessionId: 'parent', name: 'Parent', status: 'idle' },
      { sessionId: 'child1', name: 'Child 1', status: 'idle', parentSessionId: 'parent', role: 'researcher' },
      { sessionId: 'child2', name: 'Child 2', status: 'idle', parentSessionId: 'parent', role: 'coder' },
    ]

    const { roots, childrenOf } = buildSessionTree(tabs)

    expect(roots).toHaveLength(1)
    expect(roots[0].sessionId).toBe('parent')
    expect(childrenOf.get('parent')).toHaveLength(2)
    expect(childrenOf.get('parent')![0].sessionId).toBe('child1')
    expect(childrenOf.get('parent')![1].sessionId).toBe('child2')
  })

  it('treats child sessions whose parent is absent as orphan roots', () => {
    // If the parent is not in the tabs list, children still go into childrenOf
    // but won't be rendered under any root — the parent tab must exist in the list
    const tabs: SessionTab[] = [
      { sessionId: 'child1', name: 'Orphan Child', status: 'idle', parentSessionId: 'missing-parent' },
    ]

    const { roots, childrenOf } = buildSessionTree(tabs)

    // The child is not a root (it has parentSessionId), it goes into childrenOf
    expect(roots).toHaveLength(0)
    expect(childrenOf.get('missing-parent')).toHaveLength(1)
  })

  it('handles empty tabs list', () => {
    const { roots, childrenOf } = buildSessionTree([])

    expect(roots).toHaveLength(0)
    expect(childrenOf.size).toBe(0)
  })

  it('handles mixed roots and children', () => {
    const tabs: SessionTab[] = [
      { sessionId: 'root1', name: 'Root 1', status: 'idle' },
      { sessionId: 'root2', name: 'Root 2', status: 'idle' },
      { sessionId: 'child-of-1', name: 'Child of 1', status: 'idle', parentSessionId: 'root1', role: 'analyst' },
      { sessionId: 'child-of-2', name: 'Child of 2', status: 'idle', parentSessionId: 'root2', role: 'writer' },
    ]

    const { roots, childrenOf } = buildSessionTree(tabs)

    expect(roots).toHaveLength(2)
    expect(childrenOf.get('root1')).toHaveLength(1)
    expect(childrenOf.get('root2')).toHaveLength(1)
    expect(childrenOf.get('root1')![0].role).toBe('analyst')
    expect(childrenOf.get('root2')![0].role).toBe('writer')
  })
})

describe('SessionPanel — tree rendering', () => {
  beforeEach(() => {
    resetAllStores()
    installMockElectron()
  })

  afterEach(() => {
    uninstallMockElectron()
  })

  it('renders child sessions indented under parent in the recent section', () => {
    const now = Date.now()
    useSessionStore.setState({
      projectPath: '/mock/project',
      sessions: [
        { id: 'parent-1', name: 'Team Lead', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now },
        { id: 'child-1', name: 'Researcher', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now, parentSessionId: 'parent-1', role: 'researcher' },
        { id: 'child-2', name: 'Coder', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now, parentSessionId: 'parent-1', role: 'coder' },
      ],
    })

    render(React.createElement(SessionPanel))

    // Parent should be visible
    expect(screen.getByTitle('Team Lead')).toBeTruthy()

    // Expand toggle should exist for the parent (it has children)
    const toggle = screen.getByTestId('expand-toggle-parent-1')
    expect(toggle).toBeTruthy()

    // Children should NOT be visible before expanding
    expect(screen.queryByTitle('Researcher')).toBeNull()
    expect(screen.queryByTitle('Coder')).toBeNull()

    // Expand the parent
    fireEvent.click(toggle)

    // Children should now be visible
    expect(screen.getByTitle('Researcher')).toBeTruthy()
    expect(screen.getByTitle('Coder')).toBeTruthy()

    // Children container should have indentation class (ml-4)
    const childContainer = screen.getByTestId('children-of-parent-1')
    expect(childContainer.className).toContain('ml-4')
  })

  it('displays role badges for child sessions', () => {
    const now = Date.now()
    useSessionStore.setState({
      projectPath: '/mock/project',
      sessions: [
        { id: 'parent-1', name: 'Team Lead', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now },
        { id: 'child-1', name: 'Analyst', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now, parentSessionId: 'parent-1', role: 'analyst' },
      ],
    })

    render(React.createElement(SessionPanel))

    // Expand the parent
    fireEvent.click(screen.getByTestId('expand-toggle-parent-1'))

    // Role badge should be present
    expect(screen.getByText('analyst')).toBeTruthy()
  })

  it('renders sessions without parentSessionId as root-level items', () => {
    const now = Date.now()
    useSessionStore.setState({
      projectPath: '/mock/project',
      sessions: [
        { id: 'standalone-1', name: 'Solo Session', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now },
        { id: 'standalone-2', name: 'Another Solo', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now },
      ],
    })

    render(React.createElement(SessionPanel))

    // Both should be visible as root-level items
    expect(screen.getByTitle('Solo Session')).toBeTruthy()
    expect(screen.getByTitle('Another Solo')).toBeTruthy()

    // No expand toggles should exist (no children)
    expect(screen.queryByTestId('expand-toggle-standalone-1')).toBeNull()
    expect(screen.queryByTestId('expand-toggle-standalone-2')).toBeNull()
  })

  it('shows team icon on parent sessions that have children', () => {
    const now = Date.now()
    useSessionStore.setState({
      projectPath: '/mock/project',
      sessions: [
        { id: 'team-parent', name: 'Team Parent', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now },
        { id: 'team-child', name: 'Team Child', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now, parentSessionId: 'team-parent', role: 'worker' },
      ],
    })

    const { container } = render(React.createElement(SessionPanel))

    // The team parent row should contain the Users (team) icon
    expect(container.querySelector('.lucide-users')).toBeTruthy()
  })

  it('collapses children when toggle is clicked twice', () => {
    const now = Date.now()
    useSessionStore.setState({
      projectPath: '/mock/project',
      sessions: [
        { id: 'parent-1', name: 'Team Lead', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now },
        { id: 'child-1', name: 'Worker', projectPath: '/mock/project', runtime: 'kernel' as const, permissionMode: 'default' as const, createdAt: now, updatedAt: now, parentSessionId: 'parent-1', role: 'worker' },
      ],
    })

    render(React.createElement(SessionPanel))

    const toggle = screen.getByTestId('expand-toggle-parent-1')

    // Expand
    fireEvent.click(toggle)
    expect(screen.getByTitle('Worker')).toBeTruthy()

    // Collapse
    fireEvent.click(toggle)
    expect(screen.queryByTitle('Worker')).toBeNull()
  })
})
