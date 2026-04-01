interface EventLogProps {
  logs: string[];
}

export function EventLog({ logs }: EventLogProps) {
  return (
    <section className="log-panel">
      <h3>事件紀錄</h3>
      <div className="log-list">
        {logs.map((entry, index) => (
          <p key={`${entry}_${index}`}>{entry}</p>
        ))}
      </div>
    </section>
  );
}
