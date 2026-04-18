/**
 * SVG viewer — renders SVG inline with theme-aware background.
 */

interface SvgViewerProps {
  source: string;
}

export default function SvgViewer({ source }: SvgViewerProps) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      overflow: 'auto',
      padding: '24px',
    }}>
      <div
        dangerouslySetInnerHTML={{ __html: source }}
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      />
    </div>
  );
}
