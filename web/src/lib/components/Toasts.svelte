<script lang="ts">
  // Toasts live in one manual popover (top layer, no light dismiss) inside a labelled region.
  import { toasts, toast } from "../state.svelte";

  let container: HTMLElement;
  let live = $state("");

  $effect(() => {
    if (!container) return;
    const shouldShow = toasts.length > 0;
    const isOpen = container.matches(":popover-open");
    if (shouldShow && !isOpen) container.showPopover();
    if (!shouldShow && isOpen) container.hidePopover();
  });

  // Announce new messages (ariaNotify where available, live region otherwise).
  let lastId = 0;
  $effect(() => {
    const t = toasts.at(-1);
    if (!t || t.id === lastId) return;
    lastId = t.id;
    const text = t.action ? `${t.message}. Actions available.` : t.message;
    const doc = document as Document & { ariaNotify?: (s: string) => void };
    if (doc.ariaNotify) doc.ariaNotify(text);
    else live = text;
  });

  async function run(t: (typeof toasts)[number]) {
    toast.dismiss(t.id);
    try {
      await t.action?.run();
    } catch (e) {
      toast.error(e);
    }
  }
</script>

<div class="visually-hidden" aria-live="polite">{live}</div>

<section bind:this={container} popover="manual" class="toasts" aria-label="Notifications">
  {#each toasts as t (t.id)}
    <div class="toast" class:error={t.kind === "error"}>
      <span class="msg">{t.message}</span>
      {#if t.action}
        <button class="btn sm ghost action" onclick={() => run(t)}>{t.action.label}</button>
      {/if}
      <button class="btn sm icon ghost" aria-label="Dismiss" onclick={() => toast.dismiss(t.id)}>✕</button>
    </div>
  {/each}
</section>

<style>
  .toasts {
    position: fixed;
    inset: auto 16px 16px auto;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    overflow: visible;
    display: grid;
    gap: 8px;
    justify-items: end;
    width: min(380px, calc(100vw - 32px));
  }
  .toasts:not(:popover-open) {
    display: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 8px 8px 14px;
    border-radius: 12px;
    background: light-dark(#1a1a19, #f0efec);
    color: light-dark(#f0efec, #1a1a19);
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.25);
    font-size: 0.9rem;
    max-width: 100%;
  }
  @media (prefers-reduced-motion: no-preference) {
    .toast {
      animation: toast-in 0.25s var(--ease);
    }
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      translate: 0 12px;
    }
  }
  .toast.error {
    background: var(--bad);
    color: #fff;
  }
  .msg {
    flex: 1;
    min-width: 0;
  }
  .toast .btn {
    color: inherit;
  }
  .toast .btn:hover {
    background: rgb(128 128 128 / 0.25);
  }
  .action {
    font-weight: 700;
    color: light-dark(#86b6ef, #1c5cab) !important;
  }
  @media (max-width: 640px) {
    .toasts {
      inset: auto 16px 80px 16px;
      width: auto;
    }
  }
</style>
