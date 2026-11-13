import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';

/** Copie dans le presse-papiers (repli execCommand en HTTP sur réseau local). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      variant="outline"
      leftIcon={done ? <Check className="text-success" /> : <Copy />}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          toast.success('Lien copié.');
          window.setTimeout(() => setDone(false), 2000);
        } else toast.error('Copie impossible : sélectionnez le lien manuellement.');
      }}
    >
      {done ? 'Copié' : label}
    </Button>
  );
}
