"use client";

import { useId, useRef } from "react";
import { Icon } from "./icon";

export function PreviewDetails({ title, description, meta, label = "Read preview", unavailable }: {
  title: string; description: string; meta: string; label?: string; unavailable: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return <>
    <button type="button" className="text-button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog" aria-label={`${label}: ${title}`}>
      {label}<Icon name="arrow" />
    </button>
    <dialog ref={dialog} className="preview-dialog" aria-labelledby={id} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="dialog-content">
        <div className="dialog-top"><span className="demo-label">Demo preview</span><button className="icon-button" type="button" aria-label="Close preview" onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
        <p className="eyebrow">{meta}</p><h2 id={id}>{title}</h2><p>{description}</p>
        <div className="preview-disclosure"><strong>Fictional demonstration content</strong><p>{unavailable}</p></div>
        <button className="secondary" type="button" onClick={() => dialog.current?.close()}>Back to exploring</button>
      </div>
    </dialog>
  </>;
}
