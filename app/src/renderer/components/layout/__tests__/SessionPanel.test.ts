// @vitest-environment happy-dom
import React from 'react'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { installMockElectron, uninstallMockElectron } from '@renderer/__test-utils__/mock-electron'
import { resetAllStores } from '@renderer/__test-utils__/store-helpers'
import { SessionPanel } from '../SessionPanel'

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
