/**
 * Bind horizontal swipe gestures for tab navigation on mobile.
 * 
 * @param {HTMLElement} element - The DOM element to attach touch listeners to.
 * @param {Function} onSwipeLeft - Callback triggered when user swipes left (Next Tab).
 * @param {Function} onSwipeRight - Callback triggered when user swipes right (Previous Tab).
 */
export function bindSwipeGesture(element, onSwipeLeft, onSwipeRight) {
    if (!element) return;

    let startX = 0;
    let startY = 0;
    const THRESHOLD = 70; // min distance for swipe
    const ANGLE_THRESHOLD = 30; // max Y-axis deviation

    element.addEventListener("touchstart", function (e) {
        if (e.touches.length > 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    element.addEventListener("touchend", function (e) {
        if (e.changedTouches.length !== 1) return;
        
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const diffX = endX - startX;
        const diffY = Math.abs(endY - startY);

        // Ensure horizontal swipe and not just vertical scrolling
        if (Math.abs(diffX) > THRESHOLD && diffY < ANGLE_THRESHOLD) {
            if (diffX > 0) {
                // Swipe Right -> Previous
                if (onSwipeRight) onSwipeRight();
            } else if (diffX < 0) {
                // Swipe Left -> Next
                if (onSwipeLeft) onSwipeLeft();
            }
        }
    }, { passive: true });
}

/**
 * Bind a lightweight pull-to-refresh gesture for touch devices when scrolled to page top.
 * 
 * @param {HTMLElement} indicator - The DOM element acting as the refresh visual indicator.
 * @param {Function} onRefresh - Async callback returning a Promise triggered to perform the refresh.
 */
export function bindPullToRefreshGesture(indicator, onRefresh) {
    if (!indicator) return;

    const THRESHOLD = 84;
    let startY = 0;
    let deltaY = 0;
    let tracking = false;
    let loading = false;

    function resetIndicator() {
        indicator.classList.remove("is-visible", "is-armed", "is-loading");
        indicator.style.transform = "translate(-50%, -140%)";
        indicator.textContent = "下拉即可重新整理";
    }

    window.addEventListener("touchstart", function (event) {
        if (loading || window.scrollY > 0) return;
        const firstTouch = event.touches[0];
        if (!firstTouch) return;
        startY = firstTouch.clientY;
        deltaY = 0;
        tracking = true;
    }, { passive: true });

    window.addEventListener("touchmove", function (event) {
        if (!tracking || loading) return;
        const firstTouch = event.touches[0];
        if (!firstTouch) return;

        deltaY = Math.max(0, firstTouch.clientY - startY);
        if (deltaY <= 8) {
            resetIndicator();
            return;
        }

        const progress = Math.min(deltaY, 120);
        indicator.classList.add("is-visible");
        indicator.style.transform = `translate(-50%, ${-140 + progress * 0.78}%)`;
        
        if (deltaY >= THRESHOLD) {
            indicator.classList.add("is-armed");
            indicator.textContent = "放開即可重新整理";
        } else {
            indicator.classList.remove("is-armed");
            indicator.textContent = "下拉即可重新整理";
        }
    }, { passive: true });

    window.addEventListener("touchend", function () {
        if (!tracking || loading) return;
        tracking = false;

        if (deltaY < THRESHOLD) {
            resetIndicator();
            return;
        }

        loading = true;
        indicator.classList.add("is-visible", "is-loading");
        indicator.classList.remove("is-armed");
        indicator.style.transform = "translate(-50%, -10%)";
        indicator.textContent = "重新整理中...";

        Promise.resolve(onRefresh())
            .catch(function (error) {
                console.error("Pull-to-refresh failed:", error);
            })
            .finally(function () {
                loading = false;
                resetIndicator();
            });
    }, { passive: true });

    window.addEventListener("touchcancel", function () {
        tracking = false;
        deltaY = 0;
        if (!loading) resetIndicator();
    }, { passive: true });
}
