<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, value, sub, tone, children }: { label: string; value: string; sub?: string; tone?: "good" | "bad"; children?: Snippet } =
    $props();
</script>

<div class="card tile">
  <div class="label">{label}</div>
  <div class="value num" class:good={tone === "good"} class:bad={tone === "bad"}>{value}</div>
  {#if sub}<div class="sub">{sub}</div>{/if}
  {@render children?.()}
</div>

<style>
  .tile {
    padding: 16px 18px;
    display: grid;
    gap: 2px;
    align-content: start;
  }
  .label {
    font-size: 0.82rem;
    font-weight: 550;
    color: var(--muted);
  }
  .value {
    font-size: 1.6rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    font-variant-numeric: normal;
  }
  @media (max-width: 560px) {
    .value {
      font-size: 1.3rem;
    }
  }
  .sub {
    font-size: 0.82rem;
    color: var(--ink-2);
  }
</style>
