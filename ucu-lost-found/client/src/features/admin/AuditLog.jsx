// Audit log: security-relevant events, newest first.
import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { usePageTitle } from '../../components/ui';
import { Badge, EmptyState, Notice, PageHeader, Spinner } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { Pagination, ResponsiveTable, formatDateTime } from '../../design/data';
import useList from './useList';

const GROUPS = [
  ['', 'All events'], ['login.', 'Sign-in'], ['password.', 'Password recovery'], ['account.', 'Activation'],
  ['student.', 'Student accounts'], ['registry.', 'Registry'], ['admin.', 'Administrators'],
];

const LABELS = {
  'login.success': 'Signed in', 'login.failed': 'Failed sign-in',
  'password.reset_requested': 'Reset requested', 'password.reset': 'Password reset',
  'account.activation_requested': 'Activation requested', 'account.activated': 'Account activated',
  'student.deactivated': 'Student deactivated', 'student.reactivated': 'Student reactivated', 'student.reset_link_issued': 'Reset link issued',
  'registry.imported': 'Registry imported', 'registry.activation_link_issued': 'Activation link issued',
  'admin.created': 'Administrator invited', 'admin.invite_accepted': 'Invitation accepted', 'admin.role_changed': 'Role changed',
  'admin.deactivated': 'Administrator deactivated', 'admin.reactivated': 'Administrator reactivated',
};
const TONE = (a) => (a.endsWith('failed') || a.endsWith('deactivated') ? 'danger' : a.startsWith('admin.') || a.startsWith('registry.') ? 'brand' : 'neutral');

const describe = (d) => {
  if (!d) return '—';
  return Object.entries(d).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${v}`).join(' · ');
};

export default function AuditLog() {
  usePageTitle('Audit log');
  const [query, setQuery] = useState({ action: '', page: 1 });
  const { data, error } = useList('/api/admin/audit', query);

  const columns = [
    { key: 'action', label: 'Event', primary: true, render: (e) => <Badge tone={TONE(e.action)}>{LABELS[e.action] || e.action}</Badge> },
    { key: 'createdAt', label: 'When', render: (e) => <span className="whitespace-nowrap text-sm tabular-nums">{formatDateTime(e.createdAt)}</span> },
    { key: 'actor', label: 'By', render: (e) => (e.actorName ? <span className="text-sm">{e.actorName}</span> : <span className="text-sm text-muted">{e.actorType === 'anonymous' ? 'Not signed in' : e.actorType}</span>) },
    { key: 'entity', label: 'Record', render: (e) => (e.entityType ? <span className="font-mono text-xs">{e.entityType} {e.entityId}</span> : '—') },
    { key: 'details', label: 'Details', render: (e) => <span className="text-sm text-muted">{describe(e.details)}</span> },
    { key: 'ip', label: 'IP', render: (e) => <span className="font-mono text-xs text-muted">{e.ip || '—'}</span> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Audit log" description="Sign-ins, password resets, activations and every change to accounts, roles and the registry. Entries can’t be edited." />
      <FormField id="audit-group" label="Show" optionalLabel={false} className="max-w-xs">
        {(p) => (
          <select {...p} value={query.action} onChange={(e) => setQuery({ action: e.target.value, page: 1 })}>
            {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
      </FormField>
      {error && <Notice type="error">{error}</Notice>}
      {!data && !error && <Spinner label="Loading the audit log…" />}
      {data && (
        <>
          <ResponsiveTable caption="Audit log" columns={columns} rows={data.items}
            empty={<EmptyState icon={ScrollText} title="No events yet">Events appear here as people sign in and administrators make changes.</EmptyState>} />
          <Pagination {...data} noun="events" onPage={(p) => setQuery((q) => ({ ...q, page: p }))} />
        </>
      )}
    </div>
  );
}
