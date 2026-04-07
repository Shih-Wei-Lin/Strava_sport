const SWIPE_DISTANCE_THRESHOLD = 70;
const SWIPE_VERTICAL_TOLERANCE = 30;

const PULL_THRESHOLD = 84;
const PULL_VISUAL_LIMIT = 120;
const PULL_PROGRESS_OFFSET = -140;
const PULL_PROGRESS_MULTIPLIER = 0.78;
const PULL_MIN_VISUAL_DELTA = 8;

const PULL_TEXT = {
    idle: "Pull down to refresh",
    armed: "Release to refresh",
    loading: "Refreshing...",
};

export function bindSwipeGesture(element, onSwipeLeft, onSwipeRight) {
    if (!element) return;

    let startX = 0;
    let startY = 0;

    element.addEventListener(
        "touchstart",
        (event) => {
            if (event.touches.length !== 1) return;
            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
        },
        { passive: true }
    );

    element.addEventListener(
        "touchend",
        (event) => {
            if (event.changedTouches.length !== 1) return;

            const endX = event.changedTouches[0].clientX;
            const endY = event.changedTouches[0].clientY;
            const deltaX = endX - startX;
            const deltaY = Math.abs(endY - startY);

            const isHorizontalSwipe =
                Math.abs(deltaX) > SWIPE_DISTANCE_THRESHOLD && deltaY < SWIPE_VERTICAL_TOLERANCE;
            if (!isHorizontalSwipe) return;

            if (deltaX > 0 && onSwipeRight) onSwipeRight();
            if (deltaX < 0 && onSwipeLeft) onSwipeLeft();
        },
        { passive: true }
    );
}

export function bindPullToRefreshGesture(indicator, onRefresh) {
    if (!indicator) return;
    if (typeof onRefresh !== "function") {
        throw new Error("bindPullToRefreshGesture requires an onRefresh callback function.");
    }

    let startY = 0;
    let deltaY = 0;
    let tracking = false;
    let loading = false;

    const resetIndicator = () => {
        indicator.classList.remove("is-visible", "is-armed", "is-loading");
        indicator.style.transform = "translate(-50%, -140%)";
        indicator.textContent = PULL_TEXT.idle;
    };

    const updateIndicatorProgress = (pullDistance) => {
        if (pullDistance <= PULL_MIN_VISUAL_DELTA) {
            resetIndicator();
            return;
        }

        const progress = Math.min(pullDistance, PULL_VISUAL_LIMIT);
        const translateY = PULL_PROGRESS_OFFSET + progress * PULL_PROGRESS_MULTIPLIER;

        indicator.classList.add("is-visible");
        indicator.style.transform = `translate(-50%, ${translateY}%)`;

        if (pullDistance >= PULL_THRESHOLD) {
            indicator.classList.add("is-armed");
            indicator.textContent = PULL_TEXT.armed;
            return;
        }

        indicator.classList.remove("is-armed");
        indicator.textContent = PULL_TEXT.idle;
    };

    window.addEventListener(
        "touchstart",
        (event) => {
            if (loading || window.scrollY > 0) return;
            const firstTouch = event.touches[0];
            if (!firstTouch) return;

            startY = firstTouch.clientY;
            deltaY = 0;
            tracking = true;
        },
        { passive: true }
    );

    window.addEventListener(
        "touchmove",
        (event) => {
            if (!tracking || loading) return;
            const firstTouch = event.touches[0];
            if (!firstTouch) return;

            deltaY = Math.max(0, firstTouch.clientY - startY);
            updateIndicatorProgress(deltaY);
        },
        { passive: true }
    );

    window.addEventListener(
        "touchend",
        () => {
            if (!tracking || loading) return;
            tracking = false;

            if (deltaY < PULL_THRESHOLD) {
                resetIndicator();
                return;
            }

            loading = true;
            indicator.classList.add("is-visible", "is-loading");
            indicator.classList.remove("is-armed");
            indicator.style.transform = "translate(-50%, -10%)";
            indicator.textContent = PULL_TEXT.loading;

            Promise.resolve(onRefresh())
                .catch((error) => {
                    console.error("Pull-to-refresh failed:", error);
                })
                .finally(() => {
                    loading = false;
                    deltaY = 0;
                    resetIndicator();
                });
        },
        { passive: true }
    );

    window.addEventListener(
        "touchcancel",
        () => {
            tracking = false;
            deltaY = 0;
            if (!loading) resetIndicator();
        },
        { passive: true }
    );
}
