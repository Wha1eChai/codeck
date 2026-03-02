import React from 'react'
import { LucideIcon } from 'lucide-react'

interface SectionHeaderProps {
    icon: LucideIcon
    title: string
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title }) => (
    <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <Icon className="h-3 w-3" /> {title}
    </h3>
)

interface SettingsCardProps {
    children: React.ReactNode
    className?: string
}

export const SettingsCard: React.FC<SettingsCardProps> = ({ children, className }) => (
    <div className={`bg-muted/30 rounded-xl border border-border/50 p-4 ${className ?? ''}`}>
        {children}
    </div>
)

/** Small storage hint shown below section content. */
export const StorageHint: React.FC<{ text: string }> = ({ text }) => (
    <p className="text-[11px] text-muted-foreground/60 px-1 mb-3">
        {text}
    </p>
)
