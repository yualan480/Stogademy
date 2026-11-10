function getMousePos(evt) {
    var rect = canvasElement.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * canvasElement.width / rect.width,
        y: (evt.clientY - rect.top) * canvasElement.height / rect.height
    };
}

canvasElement.addEventListener("mousemove", function(evt) {
    var mousePos = getMousePos(evt);
	mouseX = mousePos.x;
    mouseY = mousePos.y;
}, false);

canvasElement.addEventListener("mousedown", function(evt) {
    var position = getMousePos(evt);
    mouseX = position.x; mouseY = position.y;
    mouseDown = true;
    clickButtons();
}, false);

canvasElement.addEventListener("mouseup", function(evt) {
    mouseDown = false;
}, false);

// not called in mobile version
function resetMouse() {
	if (justClicked) {
        justClicked = false;
    }
    else if (cursorType == 1) {
        $("#twhgCanvas").css("cursor", "auto");
        cursorType = 0;
    }
}