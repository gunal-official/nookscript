# Icon audit & icon system (Step 33)

**Scope:** every icon in the product, standardization rules, semantic choices, accessibility.
Generated from a live source sweep (`grep` of all lucide instances) + manual review.

## 1. The system (decisions)

| Rule | Decision |
|---|---|
| Set | `lucide-react` (already the product's only icon set — well-known, tree-shaken) |
| Size scale | **16 / 18 / 20 / 24 px** only = `h-4 w-4` / `h-[18px] w-[18px]` / `h-5 w-5` / `h-6 w-6` |
| Size roles | 16 = inline & inside text buttons / inputs / badges; 18 = standalone icon-buttons on 44px targets; 20 = nav (rail, drawer, bottom) + medium controls; 24 = empty states / hero spots |
| Stroke | **1.5**, one width everywhere — `svg.lucide { stroke-width: 1.5 }` in `app/globals.css` (lucide's 2 reads heavy at 16px next to 14px text) |
| Color | `currentColor` (lucide default) — inherits `text-*` from the control; active nav icons use `text-accent-fg` |
| Alignment | icons ride flex containers (`items-center`) with text; nav icons `shrink-0` so labels can ellipsis-free wrap |
| Decorative | `aria-hidden="true"` — 109 decorative instances were given it in this pass (icons inside labeled buttons, beside text, spinners) |
| Meaningful-alone | `aria-label` on the **control** (icon never carries meaning alone in this product — every icon-only button has a label: e.g. "Copy public link", "Discard this session", "Open menu", "Inbox", "Account menu") |
| Tap targets | icon-only buttons are `min-h-11 min-w-11` (44×44) at every width |
| Placeholders/emoji | none found in the product (swept for emoji — clean); generic mismatches replaced in the nav (below) |

## 2. Nav icon mapping (semantic — replaces the previous dot markers)

The sidebar had **dot markers, no icons** (`h-1.5 w-1.5 rounded-full`). All 11 destinations now
have a semantic icon (`components/app-shell/nav-items.ts` — one model for rail + drawer + menu):

| Item | Icon | Why |
|---|---|---|
| Intake | PenLine | writing client updates |
| Inbox | Inbox | inbox |
| Briefs | ClipboardList | brief = filled clipboard |
| Proposals | FileText | document |
| Plans | ListChecks | plan = checklist of deliverables |
| Updates | MessageSquare | matches the /updates empty state icon |
| Invoices | Receipt | receipt/invoice convention |
| Time | Clock | time tracking |
| Contracts | FileSignature | signed document |
| Reports | BarChart3 | analytics |
| Settings | Settings | gear convention |

## 2b. Step 34 delta (vocabulary icons + a conformance sweep)

The 34(b) surface work introduced a shared icon vocabulary, all decorative
(`aria-hidden`) inside labeled controls, at 16 (h-4) or 20 (h-5) px:

| Where | Icons | Role |
|---|---|---|
| `ui/doc-detail.tsx` | per-surface (FileText, FileSignature, Receipt, ClipboardList, Megaphone…), timeline (FilePlus2, Send, PenLine, CircleDollarSign, Ban, Hourglass, Clock…) | icon-chip tiles + activity timeline |
| `dashboard` + list stats | LayoutDashboard, Wallet, Timer, Bell, CheckCircle2, ListChecks… | stat tiles, flow stages, attention rows |
| `settings/PlanCard` | CreditCard, Sparkles, Check | the honest subscription surface |
| `settings/*` section heads | Building2, Users, LayoutTemplate, TriangleAlert | tinted section chips |
| public client pages | Link2Off | invalid-link states |
| intake thread | MessageSquare, ClipboardPaste | source bubbles + panel heads |

Conformance sweep in the same pass: **44 off-scale `h-3.5` (14px) instances
across 28 files were normalized to 16px (`h-4`)** — the scale is
16/18/20/24, full stop. Two glyph-in-control exceptions stand, both
inside 16px faces rather than standalone: the shared Checkbox `Check`
(12px, stroke 3) and the deliverable-checkbox `Check` marks (12px,
stroke 3.5) — heavy tiny glyphs so a checked box reads at a glance.

## 3. Full inventory (every icon location)

| File | n | Icons (name@size) |
|---|---|---|
| `app/(app)/briefs/[id]/page.tsx` | 2 | ArrowLeft@?, Check@? |
| `app/(app)/briefs/page.tsx` | 1 | Plus@? |
| `app/(app)/contracts/[id]/page.tsx` | 1 | ArrowLeft@? |
| `app/(app)/intake/inbox/page.tsx` | 1 | MessageSquare@? |
| `app/(app)/invoices/[id]/page.tsx` | 1 | ArrowLeft@? |
| `app/(app)/loading.tsx` | 1 | Loader2@? |
| `app/(app)/plans/[id]/page.tsx` | 1 | ArrowLeft@? |
| `app/(app)/proposals/[id]/page.tsx` | 2 | ArrowLeft@?, Check@? |
| `app/(app)/updates/[id]/page.tsx` | 1 | ArrowLeft@? |
| `components/app-shell/MobileNav.tsx` | 1 | X@? |
| `components/app-shell/Topbar.tsx` | 2 | Search@?, Inbox@? |
| `components/app-shell/WorkspaceSwitcher.tsx` | 1 | Loader2@? |
| `components/auth/logout-button.tsx` | 1 | LogOut@? |
| `components/briefs/BriefsList.tsx` | 3 | FileText@?, Plus@?, Search@? |
| `components/briefs/GenerateProposalButton.tsx` | 2 | Loader2@?, FileSignature@? |
| `components/briefs/ResolveQuestionDialog.tsx` | 1 | Loader2@? |
| `components/briefs/StatusSelect.tsx` | 1 | Loader2@? |
| `components/contracts/ContractComposer.tsx` | 2 | Loader2@?, Save@? |
| `components/contracts/ContractStatusSelect.tsx` | 1 | Loader2@? |
| `components/contracts/ContractsList.tsx` | 6 | Plus@?, Search@?, Plus@?, Loader2@?, Plus@?, X@? |
| `components/intake/AddSourceForm.tsx` | 2 | Loader2@?, Send@? |
| `components/intake/BriefForm.tsx` | 4 | Sparkles@?, Loader2@?, Check@?, Loader2@? |
| `components/intake/InboxThreadList.tsx` | 1 | MessageSquare@? |
| `components/intake/SourcePanel.tsx` | 3 | RotateCcw@?, Loader2@?, Sparkles@? |
| `components/invite/InviteAcceptPanel.tsx` | 2 | Loader2@?, UserPlus@? |
| `components/invoices/InvoiceComposer.tsx` | 4 | Trash2@?, Plus@?, Loader2@?, Save@? |
| `components/invoices/InvoiceLinkPanel.tsx` | 8 | Loader2@?, Link2@?, Check@?, Copy@?, Loader2@?, Ban@?, Loader2@?, RefreshCw@? |
| `components/invoices/InvoiceStatusSelect.tsx` | 1 | Loader2@? |
| `components/invoices/InvoicesList.tsx` | 6 | Plus@?, Search@?, Plus@?, Loader2@?, Plus@?, X@? |
| `components/invoices/PrintButton.tsx` | 1 | Printer@? |
| `components/plans/ComposeUpdateButton.tsx` | 2 | Loader2@?, Send@? |
| `components/plans/ExportMarkdownButton.tsx` | 1 | Check@? |
| `components/plans/PlanStatusSelect.tsx` | 1 | Loader2@? |
| `components/plans/PlansList.tsx` | 1 | Search@? |
| `components/plans/TaskChecklist.tsx` | 2 | Loader2@?, Check@? |
| `components/proposals/GeneratePlanButton.tsx` | 1 | Loader2@? |
| `components/proposals/ProposalStatusSelect.tsx` | 1 | Loader2@? |
| `components/proposals/ProposalsList.tsx` | 2 | FileSignature@?, Search@? |
| `components/settings/TeamCard.tsx` | 11 | Trash2@?, Loader2@?, Loader2@?, LogOut@?, Loader2@?, Check@?, Copy@?, Ban@?, Loader2@?, Loader2@?, UserPlus@? |
| `components/settings/TemplateDialog.tsx` | 1 | Loader2@? |
| `components/settings/TemplatesList.tsx` | 5 | FileText@?, Plus@?, Trash2@?, Loader2@?, Plus@? |
| `components/settings/WorkspaceDangerCard.tsx` | 2 | Trash2@?, Loader2@? |
| `components/settings/WorkspaceNameCard.tsx` | 2 | Loader2@?, Save@? |
| `components/time/TimeTimer.tsx` | 1 | X@? |
| `components/ui/checkbox.tsx` | 1 | Check@? |
| `components/ui/dialog.tsx` | 1 | X@? |
| `components/ui/select.tsx` | 1 | Check@? |
| `components/updates/ExportUpdateMarkdownButton.tsx` | 1 | Check@? |
| `components/updates/ShareLinkPanel.tsx` | 8 | Loader2@?, Link2@?, Check@?, Copy@?, Loader2@?, Ban@?, Loader2@?, RefreshCw@? |
| `components/updates/UpdateComposer.tsx` | 2 | Loader2@?, Save@? |
| `components/updates/UpdateStatusSelect.tsx` | 1 | Loader2@? |
| `components/updates/UpdatesList.tsx` | 2 | Send@?, Search@? |

Totals: 114 instances in 52 files.

## 4. Status badges (reviewed)

Badge components (`briefs/StatusBadge`, `plans/PlanStatusBadge`, `invoices/InvoiceStatusBadge`,
`contracts/ContractStatusBadge`, `proposals/ProposalStatusBadge`) are text labels via
`STATUS_STYLES` maps (human labels — "Not started"/"In progress"/"Done" etc.), never raw DB
values. Decision: **text badges stay text** (they sit next to selects; adding 16px icons to each
would crowd 320px rows); the 16px slot exists for badges that need scannable scanning later.

## 5. Accessibility proof

- Decorative icons: `aria-hidden` swept (109 instances) — screen readers hear only the label text.
- Icon-only buttons (copy, discard, print, menu, hamburger, inbox, close): all carry `aria-label`
  + 44×44 targets (`min-h-11 min-w-11` / `h-11 w-11`).
- Nav links expose `aria-current="page"` on the active item; rail keeps `title` tooltips.

## 6. Proof screenshots

Rendered evidence (real browser, `scripts/verify-responsive.mjs` Chromium): see the README
"verification" section — `step33-proof/` renders of the sidebar (1024), the invoice composer
form (1024), the team/workspace card + the mobile drawer (375 open).
