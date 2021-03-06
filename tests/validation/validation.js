﻿"use strict";

var engine;
var canvas;
var currentScene;
var config;

function compare(renderData, referenceCanvas) {
    var width = referenceCanvas.width;
    var height = referenceCanvas.height;
    var size = width * height * 4;

    var referenceContext = referenceCanvas.getContext("2d");

    var referenceData = referenceContext.getImageData(0, 0, width, height);

    var differencesCount = 0;
    for (var index = 0; index < size; index += 4) {
        if (renderData[index] === referenceData.data[index] &&
            renderData[index + 1] === referenceData.data[index + 1] &&
            renderData[index + 2] === referenceData.data[index + 2]) {
            continue;
        }

        referenceData.data[index] = 255;
        referenceData.data[index + 1] *= 0.5;
        referenceData.data[index + 2] *= 0.5;
        differencesCount++;
    }

    referenceContext.putImageData(referenceData, 0, 0);

    return differencesCount;
}

function getRenderData(canvas, engine) {
    var width = canvas.width;
    var height = canvas.height;

    var renderData = engine.readPixels(0, 0, width, height);
    var numberOfChannelsByLine = width * 4;
    var halfHeight = height / 2;

    for (var i = 0; i < halfHeight; i++) {
        for (var j = 0; j < numberOfChannelsByLine; j++) {
            var currentCell = j + i * numberOfChannelsByLine;
            var targetLine = height - i - 1;
            var targetCell = j + targetLine * numberOfChannelsByLine;

            var temp = renderData[currentCell];
            renderData[currentCell] = renderData[targetCell];
            renderData[targetCell] = temp;
        }
    }

    return renderData;
}

function saveRenderImage(data, canvas) {
    var width = canvas.width;
    var height = canvas.height;
    var screenshotCanvas = document.createElement('canvas');
    screenshotCanvas.width = width;
    screenshotCanvas.height = height;
    var context = screenshotCanvas.getContext('2d');

    var imageData = context.createImageData(width, height);
    var castData = imageData.data;
    castData.set(data);
    context.putImageData(imageData, 0, 0);

    return screenshotCanvas.toDataURL();
}

function evaluate(resultCanvas, result, renderImage, index, waitRing) {
    var renderData = getRenderData(canvas, engine);

    if (compare(renderData, resultCanvas) !== 0) {
        result.classList.add("failed");
        result.innerHTML = "×";
        console.log("failed");
    } else {
        result.innerHTML = "✔";
        console.log("validated");
    }

    waitRing.classList.add("hidden");

    renderImage.src = saveRenderImage(renderData, canvas);

    currentScene.dispose();

    runTest(index + 1);
}

function processCurrentScene(test, resultCanvas, result, renderImage, index, waitRing) {
    currentScene.executeWhenReady(function () {
        var renderCount = test.renderCount || 1;

        engine.runRenderLoop(function() {
            currentScene.render();
            renderCount--;

            if (renderCount === 0) {
                engine.stopRenderLoop();
                evaluate(resultCanvas, result, renderImage, index, waitRing);
            }
        });

    });
}

function runTest(index) {
    if (index >= config.tests.length) {
        return;
    }

    var test = config.tests[index];
    var container = document.createElement("div");
    container.id = "container#" + index;
    container.className = "container";
    document.body.appendChild(container);

    var titleContainer = document.createElement("div");
    titleContainer.className = "containerTitle";
    container.appendChild(titleContainer);

    var title = document.createElement("div");
    title.className = "title";
    titleContainer.appendChild(title);

    var result = document.createElement("div");
    result.className = "result";
    titleContainer.appendChild(result);

    var waitRing = document.createElement("img");
    waitRing.className = "waitRing";
    titleContainer.appendChild(waitRing);
    waitRing.src = "loading.gif";

    var resultCanvas = document.createElement("canvas");
    resultCanvas.className = "resultImage";
    container.appendChild(resultCanvas);

    title.innerHTML = test.title;

    console.log("Running " + test.title);

    var resultContext = resultCanvas.getContext("2d");
    var img = new Image();
    img.onload = function () {
        resultCanvas.width = img.width;
        resultCanvas.height = img.height;
        resultContext.drawImage(img, 0, 0);
    }

    img.src = "ReferenceImages/" + test.referenceImage;

    var renderImage = new Image();
    renderImage.className = "renderImage";
    container.appendChild(renderImage);

    location.href = "#" + container.id;

    if (test.sceneFolder) {
        BABYLON.SceneLoader.Load(config.root + test.sceneFolder, test.sceneFilename, engine, function (newScene) {
            currentScene = newScene;
            processCurrentScene(test, resultCanvas, result, renderImage, index, waitRing);
        });
    } else {
        // Fix references
        if (test.specificRoot) {
            BABYLON.Tools.BaseUrl = config.root + test.specificRoot;
        }

        var request = new XMLHttpRequest();
        request.open('GET', config.root + test.scriptToRun, true);

        request.onreadystatechange = () => {
            if (request.readyState === 4) {
                request.onreadystatechange = null; 

                var scriptToRun = request.responseText.replace(/..\/..\/assets\//g, config.root + "/Assets/");
                var scriptToRun = scriptToRun.replace(/..\/..\/Assets\//g, config.root + "/Assets/");

                if (test.replace) {
                    var split = test.replace.split(",");
                    for (var i = 0; i < split.length; i+= 2) {
                        var source = split[i].trim();
                        var destination = split[i + 1].trim();
                        scriptToRun = scriptToRun.replace(source, destination);
                    }
                }

                if (test.replaceUrl) {
                    var split = test.replaceUrl.split(",");
                    for (var i = 0; i < split.length; i++) {
                        var source = split[i].trim();
                        var regex = new RegExp(source, "g");
                        scriptToRun = scriptToRun.replace(regex, config.root + test.rootPath + source);
                    }
                }

                currentScene = eval(scriptToRun + test.functionToCall + "(engine)");
                processCurrentScene(test, resultCanvas, result, renderImage, index, waitRing);
            }
        };

        request.send(null);
        
    }
}

BABYLON.SceneLoader.ShowLoadingScreen = false;
BABYLON.Database.IDBStorageEnabled = false;
BABYLON.SceneLoader.ForceFullSceneLoadingForIncremental = true;

canvas = document.createElement("canvas");
canvas.className = "renderCanvas";
document.body.appendChild(canvas);
engine = new BABYLON.Engine(canvas, false);

// Loading tests
var xhr = new XMLHttpRequest();

xhr.open("GET", "config.json", true);

xhr.addEventListener("load",function() {
    if (xhr.status === 200) {

        config = JSON.parse(xhr.responseText);

        // Run tests
        runTest(0, engine);

    }
}, false);

xhr.send();
