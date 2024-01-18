import { fabric } from 'fabric'
// import { isChromeBook } from 'utils/utils';

const LATIN_CHARS_REGX = /[a-zA-Z\.\s]+/;
const NUMBERIC_REGX = /[0-9]/;
const BRACKETS_REGX = /[\(\)\]\[\{\}\]]/;
const SOURCE_BRACKETS_REGEX = /[\\/]/;
const JP_BRACKETS = /[ー「」『』（）〔〕［］｛｝｟｠〈〉《》【】〖〗〘〙〚〛゛゜。、・゠＝…•‥◦﹅﹆]/;
const JP_SPECIAL_BRACKETS = /[。、]/;
const SPECIAL_SYMBOL = /[,@]/;

const objectControls = fabric.Object.prototype.controls,
  controlsUtils = fabric.controlsUtils,
  scaleSkewStyleHandler = controlsUtils.scaleSkewCursorStyleHandler,
  { wrapWithFireEvent, wrapWithFixedAnchor, getLocalPoint } = controlsUtils;

class VerticalTextbox extends fabric.IText {
  initialize(text, options) {
    this._dimensionAffectingProps = this._dimensionAffectingProps.concat('height');
    this.textAlign = 'right';
    this.direction = 'rtl';
    this.type = 'vertical-textbox';
    this.typeObject = 'vertical-textbox';
    this.minHeight = options.width;
    this.splitByGrapheme = true;
    this.dynamicMinWidth = 2;
    this.underlineRightMargin = 2;
    this.underlineThiness = 0.75;
    this.fontSizeTextCursor = '';
    this.fillTextCursor = '';
    // re-map keys movements
    this.keysMapRtl = Object.assign(this.keysMapRtl, {
      33: 'moveCursorLeft',
      34: 'moveCursorDown',
      35: 'moveCursorUp',
      36: 'moveCursorRight',
      37: 'moveCursorDown',
      38: 'moveCursorLeft',
      39: 'moveCursorUp',
      40: 'moveCursorRight',
    });

    this.offsets = {
      underline: 0.05,
      linethrough: 0.65,
      overline: 1.10
    };

    return super.initialize.call(this, text, options);
  }

  setFontSizeTextCursor(size) {
    this.fontSizeTextCursor = size;
  }

  initDimensions() {
    if (this.__skipDimension) {
      return;
    }
    this.isEditing && this.initDelayedCursor();
    this.clearContextTop();
    this._clearCache();
    this.dynamicMinWidth = 0;

    this._styleMap = this._generateStyleMap(this._splitText());
    if (this.textAlign.indexOf('justify') !== -1) {
      // once text is measured we need to make space fatter to make justified text.
      this.enlargeSpaces();
    }
    if (this.dynamicMinWidth > this.height) {
      this._set('height', this.dynamicMinWidth);
    }
    this.width = this.calcTextWidth() || this.cursorWidth || this.MIN_TEXT_WIDTH;
    this.saveState({ propertySet: '_dimensionAffectingProps' });
  }

  styleHas(property, lineIndex) {
    if (this._styleMap && !this.isWrapping) {
      var map = this._styleMap[lineIndex];
      if (map) {
        lineIndex = map.line;
      }
    }
    return fabric.Text.prototype.styleHas.call(this, property, lineIndex);
  }

  isEmptyStyles(lineIndex) {
    if (!this.styles) {
      return true;
    }
    var offset = 0, nextLineIndex = lineIndex + 1, nextOffset, obj, shouldLimit = false,
        map = this._styleMap[lineIndex], mapNextLine = this._styleMap[lineIndex + 1];
    if (map) {
      lineIndex = map.line;
      offset = map.offset;
    }
    if (mapNextLine) {
      nextLineIndex = mapNextLine.line;
      shouldLimit = nextLineIndex === lineIndex;
      nextOffset = mapNextLine.offset;
    }
    obj = typeof lineIndex === 'undefined' ? this.styles : { line: this.styles[lineIndex] };
    for (var p1 in obj) {
      for (var p2 in obj[p1]) {
        if (p2 >= offset && (!shouldLimit || p2 < nextOffset)) {
          // eslint-disable-next-line no-unused-vars
          for (var p3 in obj[p1][p2]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  _getStyleDeclaration(lineIndex, charIndex) {
    if (this._styleMap && !this.isWrapping) {
      var map = this._styleMap[lineIndex];
      if (!map) {
        return null;
      }
      lineIndex = map.line;
      charIndex = map.offset + charIndex;
    }
    var lineStyle = this.styles && this.styles[lineIndex];
    if (!lineStyle) {
      return null;
    }
    return lineStyle[charIndex];
  }

  _setStyleDeclaration(lineIndex, charIndex, style) {
    var map = this._styleMap[lineIndex];
    lineIndex = map.line;
    charIndex = map.offset + charIndex;

    this.styles[lineIndex][charIndex] = style;
  }

  _deleteStyleDeclaration(lineIndex, charIndex) {
    var map = this._styleMap[lineIndex];
    lineIndex = map.line;
    charIndex = map.offset + charIndex;
    delete this.styles[lineIndex][charIndex];
  }

  _getLineStyle(lineIndex) {
    var map = this._styleMap[lineIndex];
    return !!this.styles[map.line];
  }

  _setLineStyle(lineIndex) {
    var map = this._styleMap[lineIndex];
    this.styles[map.line] = {};
  }

  isEndOfWrapping(lineIndex) {
    if (!this._styleMap[lineIndex + 1]) {
      // is last line, return true;
      return true;
    }
    if (this._styleMap[lineIndex + 1].line !== this._styleMap[lineIndex].line) {
      // this is last line before a line break, return true;
      return true;
    }
    return false;
  }

  _removeExtraneousStyles() {
    var linesToKeep = {};
    for (var prop in this._styleMap) {
      if (this._textLines[prop]) {
        linesToKeep[this._styleMap[prop].line] = 1;
      }
    }
    for (var prop in this.styles) {
      if (!linesToKeep[prop]) {
        delete this.styles[prop];
      }
    }
  }

  _generateStyleMap(textInfo) {
    var realLineCount     = 0,
        realLineCharCount = 0,
        charCount         = 0,
        map               = {};

    for (var i = 0; i < textInfo.graphemeLines.length; i++) {
      if (textInfo.graphemeText[charCount] === '\n' && i > 0) {
        realLineCharCount = 0;
        charCount++;
        realLineCount++;
      }
      else if (!this.splitByGrapheme && this._reSpaceAndTab.test(textInfo.graphemeText[charCount]) && i > 0) {
        // this case deals with space's that are removed from end of lines when wrapping
        realLineCharCount++;
        charCount++;
      }

      map[i] = { line: realLineCount, offset: realLineCharCount };

      charCount += textInfo.graphemeLines[i].length;
      realLineCharCount += textInfo.graphemeLines[i].length;
    }

    return map;
  }

  missingNewlineOffset(lineIndex) {
    if (this.splitByGrapheme) {
      return this.isEndOfWrapping(lineIndex) ? 1 : 0;
    }
    return 1;
  }

  onInput(e) {
    // condition fix bug change style when input japanese text with suggestion on ipad
    this.__inputType = e.inputType
    if (
        e.inputType !== 'insertFromPaste' &&
        e.inputType !== 'insertText' &&
        e.inputType !== 'insertCompositionText' &&
        e.inputType !== 'deleteContentBackward' &&
        e.inputType !== 'deleteWordBackward' &&
        e.inputType !== 'insertLineBreak' &&
        !(e.inputType === 'deleteCompositionText' && this.textSuggestBefore?.length === 1) &&
        e.inputType !== 'insertFromComposition' &&
        e.inputType !== 'deleteByCut'
    ) {
      return;
    }
    if (e.inputType === 'insertFromComposition' || e.inputType === 'insertCompositionText' || e.inputType === 'insertText') {
      this.__compositionData = e.data;
    } else {
      this.__compositionData = ''
    }
    const fromPaste = this.fromPaste;
    this.fromPaste = false;
    e && e.stopPropagation();
    if (!this.isEditing) {
      return;
    }
    // decisions about style changes.
    let nextText = this._splitTextIntoLines(this.hiddenTextarea.value).graphemeText,
        charCount = this._text.length,
        nextCharCount = nextText.length,
        removedText, insertedText,
        charDiff = nextCharCount - charCount,
        selectionStart = this.selectionStart, selectionEnd = this.selectionEnd,
        selection = selectionStart !== selectionEnd,
        copiedStyle, removeFrom, removeTo;
    if (this.hiddenTextarea.value === '') {
      this.styles = { };
      this.updateFromTextArea();
      this.fire('changed');
      if (this.canvas) {
        this.canvas.fire('text:changed', { target: this, fromPaste });
        this.canvas.requestRenderAll();
      }
      return;
    }

    if (e.inputType === 'insertFromPaste' || this.hiddenTextarea.selectionStart !== this.hiddenTextarea.textLength) {
      let textareaSelection = this.fromStringToGraphemeSelection(
        this.hiddenTextarea.selectionStart,
        this.hiddenTextarea.selectionEnd,
        this.hiddenTextarea.value
      );
      let backDelete = selectionStart > textareaSelection.selectionStart;

      if (selection) {
        removedText = this._text.slice(selectionStart, selectionEnd);
        charDiff += selectionEnd - selectionStart;
      }
      else if (nextCharCount < charCount) {
        if (backDelete) {
          removedText = this._text.slice(selectionEnd + charDiff, selectionEnd);
        }
        else {
          removedText = this._text.slice(selectionStart, selectionStart - charDiff);
        }
      }
      insertedText = nextText.slice(textareaSelection.selectionEnd - charDiff, textareaSelection.selectionEnd);
      // this code use on chromebook , when seleting input suggestion , textbox selection number change so this is the reason that causes style lost on Chrome book
      /* NOTE: this build is from a long time ago
      *       so I guess there is a bug on chromebook's touch screen
      if (textareaSelection.selectionEnd - charDiff < 0 && isChromeBook()) {
        insertedText = nextText.slice(textareaSelection.selectionEnd, textareaSelection.selectionEnd + charDiff);
      }
      */
      if (removedText && removedText.length) {
        if (insertedText.length) {
          // let's copy some style before deleting.
          // we want to copy the style before the cursor OR the style at the cursor if selection
          // is bigger than 0.
          copiedStyle = this.getSelectionStyles(selectionStart, selectionStart + 1, false);
          // now duplicate the style one for each inserted text.
          copiedStyle = insertedText.map(function() {
            // this return an array of references, but that is fine since we are
            // copying the style later.
            return copiedStyle[0];
          });
        }
        if (selection) {
          removeFrom = selectionStart;
          removeTo = selectionEnd;
        }
        else if (backDelete) {
          // detect differences between forwardDelete and backDelete
          removeFrom = selectionEnd - removedText.length;
          removeTo = selectionEnd;
        }
        else {
          removeFrom = selectionEnd;
          removeTo = selectionEnd + removedText.length;
        }
        this.removeStyleFromTo(removeFrom, removeTo);
        const markedLines = this.integrityCheck(insertedText);
        if (markedLines.length > 0 && selectionStart === this.text?.length) {
          this.fixIntegrity(markedLines);
        }
      }
      if (insertedText.length) {
        if (fromPaste && insertedText.join('') === fabric.copiedText && !fabric.disableStyleCopyPaste) {
          copiedStyle = fabric.copiedTextStyle;
        }
        if (!copiedStyle) {
          copiedStyle = [];
          const baseStyle = this.getBaseStylesFromCursor();

          for (let i = 0, len = insertedText.length; i < len; i++) {
            copiedStyle[i] = {
              'fill': baseStyle.fill,
              'fontFamily': baseStyle.fontFamily,
              'fontSize': baseStyle.fontSize,
              'fontWeight': baseStyle.fontWeight,
              'fontStyle': baseStyle.fontStyle,
              'underline': baseStyle.underline,
              'overline': baseStyle.overline,
              'linethrough': baseStyle.linethrough,
              'deltaY': baseStyle.deltaY,
              'textBackgroundColor': baseStyle._grapheneColor || baseStyle.textBackgroundColor || 'transparent'
            }
          }
        }

        this.insertNewStyleBlock(insertedText, selectionStart, copiedStyle);
        if (!fromPaste) {
          const markedLines = this.integrityCheck(insertedText);
          if (markedLines.length > 0 && selectionStart === this.text?.length) {
            this.fixIntegrity(markedLines);
          }
        }
      }
    }
    this.updateFromTextArea();
    this.fire('changed');
    if (this.canvas) {
      this.canvas.fire('text:changed', { target: this, fromPaste, inputEvent: e });
      this.canvas.requestRenderAll();
    }
    this.textSuggestBefore = e.data;
  }

  /**
   * @Override render selection styles
   * Sets style of a current selection, if no selection exist, do not set anything.
   * @param {Object} [styles] Styles object
   * @param {Number} [startIndex] Start index to get styles at
   * @param {Number} [endIndex] End index to get styles at, if not specified selectionEnd or startIndex + 1
   * @return {fabric.IText} thisArg
   * @chainable
   */
  setSelectionStyles (styles, startIndex, endIndex) {
    if (typeof startIndex === 'undefined') {
      startIndex = this.selectionStart || 0;
    }
    if (typeof endIndex === 'undefined') {
      endIndex = this.selectionEnd || startIndex;
    }
    // FK override for Chromebook
    
    /* NOTE: this build is from a long time ago
    *       so I guess there is a bug on chromebook's touch screen
    if (isChromeBook() && this.inCompositionMode) {
      startIndex = this.compositionStart;
      endIndex = startIndex + this.__compositionData.length;
    }
    */
    // End override
    for (var i = startIndex; i < endIndex; i++) {
      this._extendStyles(i, styles);
    }
    /* not included in _extendStyles to avoid clearing cache more than once */
    this._forceClearCache = true;
    return this;
  }

  // Fix the case textbox have multiple line or use Enter to break line that dont keep style
  fixIntegrity(markedLines) {
    for (let i = 0; i < markedLines.length; i++) {
      const markedLine = markedLines[i];
      const { key, len, isEmptyStyle } = markedLine;
      const line = this.styles[key];
      if (line) {
        let keys = Object.keys(line);
        if (isEmptyStyle) {
          const copiedStyle = this.getNearestStyle(key);
          if (JSON.stringify(line) !== '{}') {
            for (const _key in line) {
              if(!copiedStyle) break;
              if (JSON.stringify(line[_key]) === '{}') {
                line[_key] = Object.assign({}, copiedStyle);
              }
            }
          } else {
            for (let i = 0; i < len; i++) {
              if(!copiedStyle) break;
              line[`${i}`] = Object.assign({}, copiedStyle);
            }
          }
          keys = Object.keys(line);
        }
        let styleObjs = [];
        for (let j = 0; j < keys.length; j++) {
          const k = keys[j];
          styleObjs.push(Object.assign({},line[k]));
        }
        const newLine = {}
        let lastStyle = null;
        for (let j = 0; j < len; j++) {
          if (j < styleObjs.length) {
            newLine[`${j}`] = styleObjs[j];
            lastStyle = styleObjs[j];
          } else {
            newLine[`${j}`] = Object.assign({}, lastStyle);
          }
        }
        this.styles[key] = newLine;
      }
    }
  }

  // Check the case textbox have multiple line and use Enter to break line that dont keep style
  integrityCheck(insertedText) {
    const markedLine = [];
    const lineKeys = Object.keys(this.styles);
    for (let i = 0, len = this._unwrappedTextLines.length; i < len && lineKeys.length > 0; i++) {
      const key = lineKeys[i];
      let line = this.styles[key];
      if (line) {
        const charKeys = Object.keys(line);
        const isLast = i === len - 1 && i !== 0;
        const newEmptyLine = insertedText[0] === '\n' && insertedText.length === 1;
        const lineLength = isLast ? this._unwrappedTextLines[i].length + 1 : this._unwrappedTextLines[i].length

        const integrity = charKeys[charKeys.length-1]+'' === (charKeys.length-1)+''
          && charKeys.length - 1 === lineLength
        if (integrity === false) {
          if (newEmptyLine) {
            markedLine.push({key, len: lineLength, isEmptyStyle: true});
          } else {
            markedLine.push({key, len: lineLength});
          }
        } else {
          for (const _key in line) {
            const styleObj = line[_key]
            if (JSON.stringify(styleObj) === '{}') {
              markedLine.push({key, len: lineLength, isEmptyStyle: true});
              integrity === false;
              break;
            }
          }
        }
      }else {
        markedLine.push({key, length: this._unwrappedTextLines[i].length});
      }
    }
    return markedLine;
  }

  // Get style for the case textbox have multiple line and use Enter to break line that dont keep style
  getNearestStyle(key) {
    const keys = Object.keys(this.styles);
    let prevLine = null, nextLine = null;
    for (let i = 0; i < keys.length; i++) {
      const _key = keys[i];
      if (_key === key) {
        if (i > 0) {
          prevLine = this.styles[keys[i-1]];
        }
        if (i < keys.length - 1) {
          nextLine = this.styles[keys[i+1]]
        }
        break;
      }
    }
    if (prevLine) {
      const pKeys = Object.keys(prevLine);
      for (let i = pKeys.length - 1; i >= 0 ; i--) {
        const k = pKeys[i];
        const styleObj = prevLine[k];
        if(JSON.stringify(styleObj) !== '{}') {
          return styleObj;
        }
      }
    } else if (nextLine){
      const nKeys = Object.keys(nextLine);
      for (let i = 0; i < nKeys.length; i++) {
        const nK = nKeys[i];
        const styleObj = nextLine[nK];
        if (JSON.stringify(styleObj) !== '{}') {
          return styleObj;
        }
      }
    }
    return null;
  }

  _splitTextIntoLines(text) {
    var newText = fabric.Text.prototype._splitTextIntoLines.call(this, text),
      graphemeLines = this._wrapText(newText.lines, this.height),
      lines = new Array(graphemeLines.length);
    for (var i = 0; i < graphemeLines.length; i++) {
      lines[i] = graphemeLines[i].join('');
    }
    newText.lines = lines;
    newText.graphemeLines = graphemeLines;
    return newText;
  }

  _wrapText(lines, desiredWidth) {
    var wrapped = [], i;
    this.isWrapping = true;
    for (i = 0; i < lines.length; i++) {
      wrapped = wrapped.concat(this._wrapLine(lines[i], i, desiredWidth));
    }
    this.isWrapping = false;
    return wrapped;
  }

  _wrapLine(_line, lineIndex, desiredWidth, reservedSpace) {
    var lineWidth = 0,
      splitByGrapheme = this.splitByGrapheme,
      graphemeLines = [],
      line = [],
      // spaces in different languages?
      words = splitByGrapheme ? fabric.util.string.graphemeSplit(_line) : _line.split(this._wordJoiners),
      word = '',
      offset = 0,
      infix = splitByGrapheme ? '' : ' ',
      wordWidth = 0,
      infixWidth = 0,
      largestWordWidth = 0,
      lineJustStarted = true,
      additionalSpace = this._getWidthOfCharSpacing(),
      reservedSpace = reservedSpace || 0;
    // fix a difference between split and graphemeSplit
    if (words.length === 0) {
      words.push([]);
    }
    desiredWidth -= reservedSpace;
    for (var i = 0; i < words.length; i++) {
      // if using splitByGrapheme words are already in graphemes.
      word = splitByGrapheme ? words[i] : fabric.util.string.graphemeSplit(words[i]);
      wordWidth = this._measureWord(word, lineIndex, offset);

      lineWidth += infixWidth + wordWidth - additionalSpace;
      if (lineWidth > desiredWidth && !lineJustStarted) {
        graphemeLines.push(line);
        line = [];
        lineWidth = wordWidth;
        lineJustStarted = true;
      }
      else {
        lineWidth += additionalSpace;
      }

      if (!lineJustStarted && !splitByGrapheme) {
        line.push(infix);
      }
      line = line.concat(word);

      infixWidth = splitByGrapheme ? 0 : this._measureWord([infix], lineIndex, offset);
      offset++;
      lineJustStarted = false;
      // keep track of largest word
      if (wordWidth > largestWordWidth) {
        largestWordWidth = wordWidth;
      }
    }

    i && graphemeLines.push(line);

    if (largestWordWidth + reservedSpace > this.dynamicMinWidth) {
      this.dynamicMinWidth = largestWordWidth - additionalSpace + reservedSpace;
    }
    return graphemeLines;
  }

  _measureWord(word, lineIndex, charOffset) {
    var width = 0, prevGrapheme, skipLeft = true, isAlphaNumeric = false;
    charOffset = charOffset || 0;
    for (var i = 0, len = word.length; i < len; i++) {
      var box = this._getGraphemeBox(word[i], lineIndex, i + charOffset, prevGrapheme, skipLeft);
      isAlphaNumeric = this._isLatin(word);
      var bonusHeight = SPECIAL_SYMBOL.test(word)? 3: 0; // add height for special symbol
      width += isAlphaNumeric? box.kernedWidth: box.height + parseInt(bonusHeight);
      prevGrapheme = word[i];
    }
    return width;
  }

  toObject(properties) {
    return super.toObject.call(this, ['minHeight','splitByGrapheme'].concat(properties));
  }

  static fromObject(object, callback) {
    const objectCopy = fabric.util.object.clone(object);
    delete objectCopy.path;
    objectCopy.padding = 5;
    return fabric.Object._fromObject('VerticalTextbox', objectCopy, function (textInstance) {
      callback(textInstance);
    }, 'vertical-textbox');
  };

  toTextbox(callback) {
    const objectCopy = fabric.util.object.clone(this.toObject(['uuid']));
    const minHeight = this.minHeight;
    delete objectCopy.path;
    objectCopy.direction = 'ltr';
    objectCopy.textAlign = 'left';
    return fabric.Object._fromObject('Textbox', objectCopy, function (textbox) {
      textbox.type = 'textbox';
      textbox.typeObject = 'text';
      textbox.width = objectCopy.height; // verticaltext's height is horizontaltext's width: ;
      textbox.height = objectCopy.width;
      callback(textbox);
    }, 'text');
  }

  static fromTextbox(textbox, callback) {
    const objectCopy = fabric.util.object.clone(textbox.toObject(['uuid']));
    delete objectCopy.path;
    objectCopy.padding = 5;
    return fabric.Object._fromObject('VerticalTextbox', objectCopy, function (textInstance) {
      textInstance.textAlign = 'right';
      textInstance.direction = 'rtl';
      textInstance.type = 'vertical-textbox';
      textInstance.typeObject = 'vertical-textbox';
      textInstance.width = objectCopy.height;
      textInstance.height = objectCopy.width;
      callback(textInstance);
    }, 'vertical-textbox');
  }

  _renderTextCommon(ctx, method) {
    ctx.save();
    var lineHeights = 0, left = this._getLeftOffset(), top = this._getTopOffset();
    for (var i = 0, len = this._textLines.length; i < len; i++) {

      !this.__charBounds[i] && this.measureLine(i);

      this._renderTextLine(
        method,
        ctx,
        this._textLines[i],
        left - lineHeights,
        top + this._getLineLeftOffset(i),
        i
      );
      lineHeights += this.getHeightOfLine(i);
    }
    ctx.restore();
  }

  _renderCJKChar(method, ctx, lineIndex, charIndex, left, top) {
    !this.__charBounds[lineIndex] && this.measureLine(lineIndex);
    let charbox = this.__charBounds[lineIndex][charIndex],
      char = this._textLines[lineIndex][charIndex],
      localLineHeight = this.getHeightOfLine(lineIndex),
      charLeft = left - (localLineHeight / this.lineHeight - charbox.width) / 2,
      charTop = top + charbox.top + charbox.height / this.lineHeight,
      isLtr = this.direction === 'ltr';

    ctx.save();
    ctx.canvas.setAttribute('dir', isLtr ? 'ltr' : 'rtl');
    ctx.direction = isLtr ? 'ltr' : 'rtl';
    ctx.textAlign = isLtr ? 'left' : 'right';

    if (JP_BRACKETS.test(char)) {
      // TODO: why the fuck do we need plus 3 and minus 5 here...
      charTop += this.lineHeight * this._fontSizeMult;
      charLeft -= this.lineHeight * this._fontSizeMult;
      const tx = charLeft - charbox.width / 2,
        ty = charTop - charbox.height / 2; // somehow, the char is a bit higher after rotation;

      ctx.translate(tx, ty);
      if (JP_SPECIAL_BRACKETS.test(char)) {
        // rotate to the top right
        ctx.rotate(-Math.PI);
        ctx.translate(-tx, -ty - charbox.height / 4);
      } else {
        ctx.rotate(-Math.PI / 2);
        ctx.translate(-tx, -ty);
      }
    }

    if (SOURCE_BRACKETS_REGEX.test(char)) {
      // Need translate for "/\" characters minus on top
      ctx.translate(0, -(charbox.height * 18 / 100));
    }

    this._renderChar(method,
      ctx,
      lineIndex,
      charIndex,
      char,
      charLeft,
      charTop,
      0
    );

    ctx.restore();
  }

  _renderAlphanumeric(method, ctx, lineIndex, startIndex, endIndex, left, top) {
    !this.__charBounds[lineIndex] && this.measureLine(lineIndex);
    let charBox = this.__charBounds[lineIndex][startIndex],
      chars = '',
      drawWidth = 0,
      localLineHeight = this.getHeightOfLine(lineIndex),
      drawLeft = left,
      drawTop = top + charBox.top + charBox.height;

    for (let i = startIndex; i <= endIndex; i++) {
      chars += this._textLines[lineIndex][i];
      drawWidth += this.__charBounds[lineIndex][i].width;
    }
    const widthFactor = (drawWidth + localLineHeight / this.lineHeight);
    const heightFactor = drawWidth / 2 - charBox.height;
    drawLeft = drawLeft - widthFactor / 2;
    drawTop = drawTop + heightFactor;
    ctx.save();
    const _boxHeight = charBox.height;
    const tx = drawLeft + drawWidth / 2 - _boxHeight / 8,
      ty = drawTop - _boxHeight / 8;
    ctx.translate(tx, ty);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-tx, -ty);
    this._renderChar(method,
      ctx,
      lineIndex,
      startIndex,
      chars,
      drawLeft,
      drawTop,
      0
    );

    ctx.restore();
  }

  _renderChars(method, ctx, line, left, top, lineIndex) {
    let timeToRender,
      startChar = null,
      actualStyle,
      nextStyle,
      endChar = null;
    ctx.save();
    left += 1; // DPP-4083 - drama of line decoration and object's control bounding

    for (var i = 0, len = line.length - 1; i <= len; i++) {
      if (this._isLatin(line[i])) {
        timeToRender = (i === len || !this._isLatin(line[i + 1]));
        if (startChar === null && this._isLatin(line[i])) {
          startChar = i;
        };

        if (!timeToRender) {
          actualStyle = actualStyle || this.getCompleteStyleDeclaration(lineIndex, i);
          nextStyle = this.getCompleteStyleDeclaration(lineIndex, i + 1);
          timeToRender = this._hasStyleChanged(actualStyle, nextStyle);
        }

        if (timeToRender) {
          endChar = i;
          this._renderAlphanumeric(method, ctx, lineIndex, startChar, endChar, left, top);
          timeToRender = false;
          startChar = null;
          endChar = null;
          actualStyle = nextStyle;
        }
      } else {
        this._renderCJKChar(method, ctx, lineIndex, i, left, top);
      }
    }
    ctx.restore();
  }

  _isLatin(char) {
    return LATIN_CHARS_REGX.test(char) || BRACKETS_REGX.test(char) || NUMBERIC_REGX.test(char);
  }

  calcTextWidth() {
    return Math.max(this.width, super.calcTextHeight());
  }

  calcTextHeight() {
    let longestLine = 0,
      currentLineHeight = 0,
      char,
      charBox,
      space = 0;

    if (this.charSpacing !== 0) {
      space = this._getWidthOfCharSpacing();
    }
    for (var lineIndex = 0, len = this._textLines.length; lineIndex < len; lineIndex++) {
      !this.__charBounds[lineIndex] && this._measureLine(lineIndex);

      currentLineHeight = 0;
      for (let charIndex = 0, rlen = this._textLines[lineIndex].length; charIndex < rlen; charIndex++) {
        char = this._textLines[lineIndex][charIndex];
        charBox = this.__charBounds[lineIndex][charIndex];
        if (char) {
          if (this._isLatin(char)) {
            currentLineHeight += charBox.width + space;
          } else {
            currentLineHeight += charBox.height + space;
          }
        }
      }
      if (currentLineHeight > longestLine) {
        longestLine = currentLineHeight;
      }
    }
    return longestLine + this.cursorWidth;
  }

  getSelectionStartFromPointer(e) {
    var mouseOffset = this.getLocalPointer(e),
      prevHeight = 0,
      width = 0,
      height = 0,
      charIndex = 0,
      lineIndex = 0,
      charBox,
      lineHeight = 0,
      space = 0,
      line;

    if (this.charSpacing !== 0) {
      space = this._getWidthOfCharSpacing();
    }
    // handling of RTL: in order to get things work correctly,
    // we assume RTL writing is mirrored compared to LTR writing.
    // so in position detection we mirror the X offset, and when is time
    // of rendering it, we mirror it again.
    mouseOffset.x = this.width * this.scaleX - mouseOffset.x + width;
    for (var i = 0, len = this._textLines.length; i < len; i++) {
      if (width <= mouseOffset.x) {
        lineHeight = this.getHeightOfLine(i) * this.scaleY;
        width += lineHeight;
        lineIndex = i;
        if (i > 0) {
          charIndex += this._textLines[i - 1].length + this.missingNewlineOffset(i - 1);
        }
      }
      else {
        break;
      }
    }
    line = this._textLines[lineIndex];
    !this.__charBounds[lineIndex] && this.measureLine(lineIndex);

    for (var j = 0, jlen = line.length; j < jlen; j++) {
      prevHeight = height;
      charBox = this.__charBounds[lineIndex][j];
      if (this._isLatin(this._textLines[lineIndex][j])) {
        height += charBox.width * this.scaleY + space;
      } else {
        height += charBox.height * this.scaleY + space;
      }
      if (height <= mouseOffset.y) {
        charIndex++;
      }
      else {
        break;
      }
    }

    return this._getNewSelectionStartFromOffset(mouseOffset, prevHeight, height, charIndex, jlen);
  }

  _getNewSelectionStartFromOffset(mouseOffset, prevHeight, height, index, jlen) {
    // we need Math.abs because when width is after the last char, the offset is given as 1, while is 0
    var distanceBtwLastCharAndCursor = mouseOffset.y - prevHeight,
      distanceBtwNextCharAndCursor = height - mouseOffset.y,
      offset = distanceBtwNextCharAndCursor > distanceBtwLastCharAndCursor ||
        distanceBtwNextCharAndCursor < 0 ? 0 : 1,
      newSelectionStart = index + offset;
    // if object is horizontally flipped, mirror cursor location from the end
    if (this.flipX) {
      newSelectionStart = jlen - newSelectionStart;
    }

    if (newSelectionStart > this._text.length) {
      newSelectionStart = this._text.length;
    }

    return newSelectionStart;
  }

  _getCursorBoundariesOffsets(position) {
    if (this.cursorOffsetCache && 'top' in this.cursorOffsetCache) {
      return this.cursorOffsetCache;
    }
    var lineLeftOffset,
      lineIndex,
      charIndex,
      topOffset = 0,
      leftOffset = 0,
      boundaries,
      charBox,
      cursorPosition = this.get2DCursorLocation(position);
    charIndex = cursorPosition.charIndex;
    lineIndex = cursorPosition.lineIndex;
    !this.__charBounds[lineIndex] && this.measureLine(lineIndex);
    for (var i = 0; i < lineIndex; i++) {
      leftOffset += this.getHeightOfLine(i);
    }

    for (var i = 0; i < charIndex; i++) {
      charBox = this.__charBounds[lineIndex][i];
      if (this._isLatin(this._textLines[lineIndex][i])) {
        topOffset += charBox.width;
      } else {
        topOffset += charBox.height;
      }
    }

    lineLeftOffset = this._getLineLeftOffset(lineIndex);
    // bound && (leftOffset = bound.left);
    if (this.charSpacing !== 0 && charIndex === this._textLines[lineIndex].length) {
      leftOffset -= this._getWidthOfCharSpacing();
    }
    boundaries = {
      top: lineLeftOffset + (topOffset > 0 ? topOffset : 0),
      left: leftOffset,
    };
    if (this.direction === 'rtl') {
      boundaries.left *= -1;
    }

    this.cursorOffsetCache = boundaries;
    return this.cursorOffsetCache;
  }
  _getGraphemeBox(grapheme, lineIndex, charIndex, prevGrapheme, skipLeft) {
    let box = super._getGraphemeBox(grapheme, lineIndex, charIndex, prevGrapheme, skipLeft);
    box.top = 0;
    box.height = Number(box.height)

    if (charIndex > 0 && !skipLeft) {
      const previousBox = this.__charBounds[lineIndex][charIndex - 1];
      const isAlphaNumeric = this._isLatin(this._textLines[lineIndex][charIndex - 1]);
      box.top = previousBox.top + previousBox[isAlphaNumeric ? 'width' : 'height'];
    }

    return box;
  }

  /**
   *
   * @param {*} boundaries
   * @param {CanvasRenderingContext2D} ctx
   */
  renderSelection(boundaries, ctx) {
    var selectionStart = this.inCompositionMode ? this.hiddenTextarea.selectionStart : this.selectionStart,
      selectionEnd = this.inCompositionMode ? this.hiddenTextarea.selectionEnd : this.selectionEnd,
      isJustify = this.textAlign.indexOf('justify') !== -1,
      start = this.get2DCursorLocation(selectionStart),
      end = this.get2DCursorLocation(selectionEnd),
      startLine = start.lineIndex,
      endLine = end.lineIndex,
      startChar = start.charIndex < 0 ? 0 : start.charIndex,
      endChar = end.charIndex < 0 ? 0 : end.charIndex;
    !this.__charBounds[endLine] && this.measureLine(endLine);
    for (var i = startLine; i <= endLine; i++) {
      let lineHeight = this.getHeightOfLine(i),
        boxStart = 0, boxEnd = 0;

      if (i === startLine) {
        boxStart = this.__charBounds[startLine][startChar].top;
      }
      if (i >= startLine && i < endLine) {
        boxEnd = isJustify && !this.isEndOfWrapping(i) ? this.height : this.getLineWidth(i) || 5; // WTF is this 5?
      }
      else if (i === endLine) {
        if (endChar === 0) {
          boxEnd = this.__charBounds[endLine][endChar].top;
        }
        else {
          var charSpacing = this._getWidthOfCharSpacing();
          const prevCharBox = this.__charBounds[endLine][endChar - 1];
          boxEnd = prevCharBox.top - charSpacing;
          if (this._isLatin(this._textLines[endLine][endChar - 1])) {
            boxEnd += prevCharBox.width;
          } else {
            boxEnd += prevCharBox.height;
          }
        }
      }

      let drawStart = boundaries.left - boundaries.leftOffset,
        drawWidth = lineHeight,
        drawHeight = boxEnd - boxStart;

      if (this.lineHeight < 1 || (i === endLine && this.lineHeight > 1)) {
        drawWidth /= this.lineHeight;
      }
      if (this.inCompositionMode) {
        ctx.fillStyle = this.compositionColor || 'black';
      }
      else {
        ctx.fillStyle = this.selectionColor;
      }
      if (this.direction === 'rtl') {
        drawStart = this.width - drawStart - drawWidth;
      }
      ctx.fillRect(
        drawStart,
        boundaries.top + boxStart,
        drawWidth,
        drawHeight,
      );
      boundaries.leftOffset -= lineHeight;
    }
  }


  renderCursor(boundaries, ctx) {
    var cursorLocation = this.get2DCursorLocation(),
      lineIndex = cursorLocation.lineIndex,
      charIndex = cursorLocation.charIndex > 0 ? cursorLocation.charIndex - 1 : 0,
      charBox = this.__charBounds[lineIndex][charIndex],
      charHeight = this.getValueOfPropertyAt(lineIndex, charIndex, 'fontSize'),
      multiplier = this.scaleX * this.canvas.getZoom(),
      cursorWidth = this.cursorWidth / multiplier,
      topOffset = boundaries.topOffset,
      lineHeight = this.getHeightOfLine(lineIndex),
      drawStart = boundaries.left - boundaries.leftOffset + (lineHeight / this.lineHeight + Number(charBox.height)) / 2;

    if (this.inCompositionMode) {
      this.renderSelection(boundaries, ctx);
    }
    if (this.direction === 'rtl') {
      drawStart = this.width - drawStart;
    }
    ctx.fillStyle = this.cursorColor || this.getValueOfPropertyAt(lineIndex, charIndex, 'fill');
    ctx.globalAlpha = this.__isMousedown ? 1 : this._currentCursorOpacity;
    ctx.fillRect(
      drawStart,
      topOffset + boundaries.top,
      charHeight,
      cursorWidth,
    );
  }

  _renderTextLinesBackground(ctx) {
    if (!this.textBackgroundColor && !this.styleHas('textBackgroundColor')) {
      return;
    }
    var heightOfLine,
      originalFill = ctx.fillStyle,
      line, lastColor,
      leftOffset = this.width - this._getLeftOffset(),
      lineTopOffset = this._getTopOffset(),
      charBox, currentColor, path = this.path,
      boxHeight = 0,
      left = 1, // DPP-4083 - drama of line decoration and object's control bounding
      top = null,
      char;

    for (var i = 0, len = this._textLines.length; i < len; i++) {
      heightOfLine = this.getHeightOfLine(i);
      left += heightOfLine;
      if (!this.textBackgroundColor && !this.styleHas('textBackgroundColor', i)) {
        continue;
      }
      !this.__charBounds[i] && this.measureLine(i);
      line = this._textLines[i];
      boxHeight = 0;
      lastColor = this.getValueOfPropertyAt(i, 0, 'textBackgroundColor');
      top = this.__charBounds[i][0].top;
      for (var j = 0, jlen = line.length; j < jlen; j++) {
        char = line[j];
        charBox = this.__charBounds[i][j];
        currentColor = this.getValueOfPropertyAt(i, j, 'textBackgroundColor');

        if (currentColor !== lastColor) {
          ctx.fillStyle = lastColor;
          if (lastColor) {
            ctx.fillRect(
              leftOffset - left + heightOfLine - (heightOfLine / this.lineHeight),
              lineTopOffset + top,
              heightOfLine / this.lineHeight,
              boxHeight
            )
          }

          if (this._isLatin(char)) {
            boxHeight = charBox.width;
          } else {
            boxHeight = charBox.height;
          }
          lastColor = currentColor;
          top = charBox.top;
        }
        else {
          if (this._isLatin(char)) {
            boxHeight += charBox.kernedWidth;
          } else {
            boxHeight += charBox.height;
          }
        }
      }
      if (currentColor && !path) {
        ctx.fillStyle = currentColor;
        ctx.fillRect(
          leftOffset - left + heightOfLine - (heightOfLine / this.lineHeight),
          lineTopOffset + top,
          heightOfLine / this.lineHeight,
          boxHeight
        );
      }

    }
    ctx.fillStyle = originalFill;
    // if there is text background color no
    // other shadows should be casted
    this._removeShadow(ctx);
  }

  _renderTextDecoration(ctx, type) {
    if (!this[type] && !this.styleHas(type)) {
      return;
    }
    let heightOfLine, size, _size,
      dy, _dy,
      left = 1, // DPP-4083 - drama of line decoration and object's control bounding
      top = 0,
      boxHeight = 0,
      char = '',
      line, lastDecoration,
      leftOffset = this.width - this._getLeftOffset(),
      topOffset = this._getTopOffset(),
      boxWidth, charBox, currentDecoration,
      currentFill, lastFill,
      offsetY = this.offsets[type];

    for (var i = 0, len = this._textLines.length; i < len; i++) {
      heightOfLine = this.getHeightOfLine(i);
      left += heightOfLine;
      if (!this[type] && !this.styleHas(type, i)) { continue; }
      !this.__charBounds[i] && this.measureLine(i);

      boxHeight = 0;
      line = this._textLines[i];
      boxWidth = 0;
      lastDecoration = this.getValueOfPropertyAt(i, 0, type);
      lastFill = this.getValueOfPropertyAt(i, 0, 'fill');
      top = this.__charBounds[i][0].top;
      size = heightOfLine / this.lineHeight;

      dy = this.getValueOfPropertyAt(i, 0, 'deltaY');
      const underLineData = [];
      let maxSize = 0;
      for (var j = 0, jlen = line.length; j < jlen; j++) {
        charBox = this.__charBounds[i][j];
        char = line[j];
        currentDecoration = this.getValueOfPropertyAt(i, j, type);
        currentFill = this.getValueOfPropertyAt(i, j, 'fill');
        _size = this.getHeightOfChar(i, j);
        maxSize = type === 'underline' && Math.max(maxSize,_size);
        _dy = this.getValueOfPropertyAt(i, j, 'deltaY');

        (!lastDecoration) && (top = charBox.top);

        if (
          (currentDecoration !== lastDecoration || currentFill !== lastFill || _size !== size || _dy !== dy)
          && boxWidth > 0
        ) {
          if (lastDecoration && lastFill) {
            if (type !== 'underline') {
              ctx.fillStyle = lastFill;
              ctx.fillRect(
                leftOffset - left + heightOfLine - _size * offsetY,
                topOffset + top,
                this.fontSize / 15,
                boxHeight
              );
            } else {
              underLineData.push({
                index: j,
                x: leftOffset - left + heightOfLine - _size * offsetY,
                y: topOffset + top,
                width: this.fontSize / 15,
                height: boxHeight,
                size: maxSize,
                fillStyle: lastFill
              });
            }
          }
          boxWidth = charBox.width;
          if (this._isLatin(char)) {
            boxHeight = charBox.width;
          } else {
            boxHeight = charBox.height;
          }
          lastDecoration = currentDecoration;
          lastFill = currentFill;
          size = _size;
          dy = _dy;
          top = charBox.top;
        }
        else {
          if (this._isLatin(char)) {
            boxHeight += charBox.kernedWidth;
          } else {
            boxHeight += charBox.height;
          }
          boxWidth += charBox.kernedWidth;
        }
      }
      ctx.fillStyle = currentFill;
      if (currentDecoration && currentFill) {
        if (type !== 'underline') {
          ctx.fillRect(
            leftOffset - left + heightOfLine - _size * offsetY,
            topOffset + top,
            this.fontSize / 15,
            boxHeight
          );
        } else {
          underLineData.push({
            index: 999,
            x: leftOffset - left + heightOfLine - _size * offsetY,
            y: topOffset + top,
            width: this.fontSize / 15,
            height: boxHeight,
            size: maxSize,
            fillStyle: currentFill
          });
        }
      }

      // ========= render underline decoration ======
      this._renderUnderlineDecor(ctx, underLineData, type);
    }
    // if there is text background color no
    // other shadows should be casted
    this._removeShadow(ctx);
  }

  _renderUnderlineDecor (ctx, underlinesData, type) {
    if (underlinesData.length > 0 && type === 'underline') {
      const sectors = {};
      let sectorIndex = 0;
      let lastSectorEnd = underlinesData[0].y + underlinesData[0].height;
      sectors['0'] = [underlinesData[0]];

      // group data to sector
      for (let k = 1; k < underlinesData.length; k++) {
        const data = underlinesData[k];
        if (fabric.util.isAlmostEqual(lastSectorEnd, data.y)) {
          let sector = sectors[sectorIndex] !== undefined ? sectors[sectorIndex] : [];
          sector.push(data);
          lastSectorEnd = data.y + data.height;
        } else {
          sectorIndex++;
          sectors[sectorIndex] = [data]
          lastSectorEnd = data.y + data.height;
        }
      }

      // ===== do the rendering =====
      for (let t = 0; t <= sectorIndex; t++) {
        const sec = sectors[t];
        if (sec && sec.length > 1) {
          // get max x
          let maxX = sec[0].x;
          let maxSize = sec[0].size;
          let averageSize = 0;
          let numTotalChar = 0;
          let biasRatio = 0; // with font size bigger they will affect more to thickness of underline
          for (let m = 0; m < sec.length; m++) {
            maxX = sec[m].x > maxX ? sec[m].x : maxX;
            maxSize = Math.max(maxSize, sec[m].size);
            const numChar = sec[m].height / sec[m].size;
            biasRatio = sec[m].size / 50;
            biasRatio = biasRatio > 1 ? biasRatio : 1;
            averageSize += sec[m].size * Math.floor(numChar) * biasRatio;
            numTotalChar += numChar * biasRatio;
          }
          averageSize = averageSize / numTotalChar;
          let lineThickness = averageSize / 15;
          lineThickness =
            lineThickness < 1 ? 1 : lineThickness > 5 ? 5 : lineThickness;
          // rewrite x data
          for (let i = 0; i < sec.length; i++) {
            const _drawData = sec[i];
            ctx.fillStyle = _drawData.fillStyle;
            _drawData.x = fabric.util._round(maxX + this.underlineRightMargin);
            const yPos = i > 0 ? sec[i - 1].y + sec[i - 1].height : _drawData.y; // to avoid overlaping line in one segment
            ctx.fillRect(_drawData.x - lineThickness, yPos, lineThickness, _drawData.height);
          }
        } else if (sec && sec.length === 1) {
          const _drawData = sec[0];
          ctx.fillStyle = _drawData.fillStyle;
          let lineThickness = _drawData.size / 15;
          lineThickness =
            lineThickness < 1 ? 1 : lineThickness > 5 ? 5 : lineThickness;
          const xPos = fabric.util._round(
            _drawData.x + this.underlineRightMargin
          );
          ctx.fillRect(xPos - lineThickness, _drawData.y, lineThickness, _drawData.height);
        }
      }
    }
  }

  _getTextWidth() {
    let textWidth = this.getHeightOfLine(0);
    for (let i = 1, len = this.textLines.length; i < len; i++) {
      textWidth += this.getHeightOfLine(i);
    }
    return textWidth;
  }

  _getTextHeight() {
    let textHeight = this.measureLine(0).width;
    for (let i = 1, len = this.textLines.length; i < len; i++) {
      textHeight = Math.max(textHeight, this.measureLine(i).width);
    }

    return textHeight;
  }

  enterEditing(){
    super.enterEditing();
  }

  getBaseStylesFromCursor(start) {
    if (start === undefined) {
      if (this.selectionStart > 0) {
        start = this.selectionStart - 1;
      } else {
        start = this.selectionStart + 1;
      }
    }

    const loc = this.get2DCursorLocation(start, true);
    let baseStyle = this;

    if (
      loc &&
      this.styles[0] &&
      this.styles.length > loc.lineIndex &&
      this.styles[loc.lineIndex].length > loc.charIndex
    ) {
      baseStyle = this.styles[loc.lineIndex][loc.charIndex];
    }

    return baseStyle;
  }

  changeWidthAndHeight = wrapWithFireEvent('resizing',
    wrapWithFixedAnchor((_, transform, x, y) => {
      const isTransformCentered = (transform) => {
        return transform.originX === 'center' && transform.originY === 'center';
      }
      let target = transform.target, localPoint = getLocalPoint(transform, transform.originX, transform.originY, x, y),
        strokePadding = target.strokeWidth / (target.strokeUniform ? target.scaleX : 1),
        multiplier = isTransformCentered(transform) ? 2 : 1,
        changeWidth = !['mt', 'mb'].includes(transform.corner),
        changeHeight = !['ml', 'mr'].includes(transform.corner),
        oldWidth = target.width,
        oldHeight = target.height,
        newWidth = Math.abs(localPoint.x * multiplier / target.scaleX) - strokePadding,
        newHeight = Math.abs(localPoint.y * multiplier / target.scaleY) - strokePadding;

      transform.original.width = oldWidth;
      transform.original.height = oldHeight;

      changeWidth && target.set('width', Math.max(newWidth, this._getTextWidth()));
      changeHeight && target.set('height', newHeight);
      return (changeWidth && oldWidth !== newWidth) || (changeHeight && oldHeight !== newHeight);
    })
  );

  controls = (() => {
    const controls = {};
    const positions = ['tr', 'tl', 'bl', 'br', 'mr', 'ml', 'mt', 'mb'];
    controls.mtr = objectControls.mtr;

    for (let i = 0, len = positions.length; i < len; i++) {
      const key = positions[i];
      controls[key] = new fabric.Control({
        x: objectControls[key].x,
        y: objectControls[key].y,
        actionHandler: this.changeWidthAndHeight,
        cursorStyleHandler: scaleSkewStyleHandler,
        actionName: 'resizing',
      })
    }
    return controls;
  })()
}

export default VerticalTextbox;