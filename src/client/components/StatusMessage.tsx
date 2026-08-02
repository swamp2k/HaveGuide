interface StatusMessageProps {
  kind?: 'info' | 'error' | 'success';
  children: React.ReactNode;
}

export function StatusMessage({ kind = 'info', children }: StatusMessageProps) {
  return (
    <div className={`status-message status-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
