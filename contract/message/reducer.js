// Extracted verbatim from frontend/src/components/pages/Message.tsx at 018634fda4bb1b006c0c6ca1d7f3cdcbaa9bba39.
((previous) => {
      if (!previous) return next;
      const messages = new Map(previous.messages.map((m) => [m.id, m]));
      for (const m of next.messages)
        messages.set(m.id, {
          ...m,
          read_at: m.read_at || messages.get(m.id)?.read_at || "",
        });
      return {
        ...next,
        messages: [...messages.values()].sort((a, b) => a.id - b.id),
        has_older: older ? next.has_older : previous.has_older,
      };
    })
