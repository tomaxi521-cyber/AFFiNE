export function FolderIcon({open=false}:{open?:boolean}) {
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M3 9V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2"/>{open?<path d="M3 9h19l-3 11H4L3 9Z"/>:<path d="M3 9h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/>}</svg>;
}
