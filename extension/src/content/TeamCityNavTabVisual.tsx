import type { SVGProps } from 'react'

export function ProductLogoVisual(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="3.65381 13.7822 30 30" aria-hidden="true" focusable="false" {...props}>
      <path d="M24.4871 13.7822H12.8205C7.75786 13.7822 3.65381 17.8863 3.65381 22.9489V34.6156C3.65381 39.6782 7.75786 43.7822 12.8205 43.7822H24.4871C29.5498 43.7822 33.6538 39.6782 33.6538 34.6156V22.9489C33.6538 17.8863 29.5498 13.7822 24.4871 13.7822Z" fill="white" fillOpacity="0.22" stroke="white" strokeOpacity="0.18" />
      <path d="M25.5534 18.2071H12.7201C10.1887 18.2071 8.13672 20.2592 8.13672 22.7905V35.6238C8.13672 38.1551 10.1887 40.2071 12.7201 40.2071H25.5534C28.0847 40.2071 30.1367 38.1551 30.1367 35.6238V22.7905C30.1367 20.2592 28.0847 18.2071 25.5534 18.2071Z" fill="#171922" />
      <path d="M12.4386 26.7773V25.5095H18.4116V26.7773H16.1851V32.7822H14.6652V26.7773H12.4386ZM19.3953 32.7822V25.5095H20.9329V28.5102H24.0544V25.5095H25.5885V32.7822H24.0544V29.778H20.9329V32.7822H19.3953Z" fill="white" />
    </svg>
  )
}

export function NavTabBodyShape() {
  return (
    <div className="tcba-nav-tab__shape-clip" aria-hidden="true">
      <svg className="tcba-nav-tab__shape" viewBox="0 0 45 112" preserveAspectRatio="none">
        <path d="M44 86.7451V56V25.2549C44 20.8627 42.2745 17.2026 40.549 15.7386C40.549 15.7386 30.1961 5.85621 26.7451 3.29412C23.2941 0.732026 20.8784 0 17.2549 0H7.33333C3.01999 0 0 1.46405 0 5.85621V56V106.144C0 110.536 3.01999 112 7.33333 112H17.2549C20.8784 112 23.2941 111.268 26.7451 108.706C30.1961 106.144 40.549 96.2614 40.549 96.2614C42.2745 94.7974 44 91.1373 44 86.7451Z" />
      </svg>
    </div>
  )
}

export function NavTabMainButtonVisual() {
  return <ProductLogoVisual className="tcba-tab__main-visual" />
}

export function NavTabCollapseVisual() {
  return (
    <svg viewBox="10 71 18 24" aria-hidden="true">
      <path d="M23.6538 74.7822L14.6538 82.7822L23.6538 90.7822" />
    </svg>
  )
}
