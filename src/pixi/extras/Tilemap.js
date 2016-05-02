

PIXI.Tilemap = function(texture)
{
    PIXI.DisplayObjectContainer.call(this);

    /**
     * The texture of the Tilemap
     *
     * @property texture
     * @type Texture
     */
    this.texture = texture;

    /**
     * Whether the Tilemap is dirty or not
     *
     * @property dirty
     * @type Boolean
     */
    this.dirty = true;

    /**
     * The blend mode to be applied to the sprite. Set to PIXI.blendModes.NORMAL to remove any blend mode.
     *
     * @property blendMode
     * @type Number
     * @default PIXI.blendModes.NORMAL;
     */
    this.blendMode = PIXI.blendModes.NORMAL;

    // transform matrix created in updateTransform
    this.transform = null;

    // create buffer with all data required by shader to draw this object
    this.buffer = new PIXI.Float32Array(16);

    // screen destination position
    // l, b,    0,1
    // l, t,    4,5
    // r, b,    8,9
    // r, t,    12,13
    var l = 0;
    var r = l + this.texture.width;
    var t = 0;
    var b = t + this.texture.height;

    this.buffer[ 0 ] = this.buffer[ 4 ] = l;
    this.buffer[ 1 ] = this.buffer[ 9 ] = b;
    this.buffer[ 8 ] = this.buffer[ 12] = r;
    this.buffer[ 5 ] = this.buffer[ 13] = t;

    // texture source position
    // x, b,    2,3
    // x, y,    6,7
    // r, b,    10,11
    // r, y,    14,15
    this.buffer[ 2 ] = this.buffer[ 6 ] = 0;
    this.buffer[ 3 ] = this.buffer[ 11] = 1;
    this.buffer[ 10] = this.buffer[ 14] = 1;
    this.buffer[ 7 ] = this.buffer[ 15] = 0;
};

// constructor
PIXI.Tilemap.prototype = Object.create(PIXI.DisplayObjectContainer.prototype);
PIXI.Tilemap.prototype.constructor = PIXI.Tilemap;

PIXI.Tilemap.prototype.update = function() {};
PIXI.Tilemap.prototype.postUpdate = function() {};

PIXI.Tilemap.prototype._renderWebGL = function(renderSession)
{
    // if the sprite is not visible or the alpha is 0 then no need to render this element
    if(!this.visible || this.alpha <= 0)return;

    renderSession.spriteBatch.stop();

    // init! init!
    if(!this._vertexBuffer)this._initWebGL(renderSession);

    renderSession.shaderManager.setShader(renderSession.shaderManager.tilemapShader);

    this._renderTilemap(renderSession);

    renderSession.spriteBatch.start();
};

PIXI.Tilemap.prototype._initWebGL = function(renderSession)
{
    var gl = renderSession.gl;

    this._vertexBuffer = gl.createBuffer();
    this._indexBuffer = gl.createBuffer();
    this._uvBuffer = gl.createBuffer();
    this._colorBuffer = gl.createBuffer();

    // create a GL buffer to transfer all the vertex position data through
    this.positionBuffer = gl.createBuffer();
    // bind the buffer to the RAM resident positionBuffer
    gl.bindBuffer( gl.ARRAY_BUFFER, this.positionBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, this.buffer, gl.STATIC_DRAW );
};


PIXI.Tilemap.prototype.makeProjection = function(_width, _height)
{
  // project coordinates into a 2x2 number range, starting at (-1, 1)
  var m = new PIXI.Float32Array(9);
  m[0] = 2 / _width;
  m[1] = 0;
  m[2] = 0;

  m[3] = 0;
  m[4] = -2 / _height;
  m[5] = 0;
  
  m[6] = -1;
  m[7] = 1;
  m[8] = 1;
  return m;
};


PIXI.Tilemap.prototype.makeTransform = function(_x, _y, _angleInRadians, _scaleX, _scaleY)
{
  var c = Math.cos( _angleInRadians );
  var s = Math.sin( _angleInRadians );
  var m = new Float32Array(9);
  m[0] = c * _scaleX;
  m[1] = -s * _scaleY;
  m[2] = 0;
  m[3] = s * _scaleX;
  m[4] = c * _scaleY;
  m[5] = 0;
  m[6] = _x;
  m[7] = _y;
  m[8] = 1;
  return m;
};

var rot = 0.0;

PIXI.Tilemap.prototype._renderTilemap = function(renderSession)
{
    var gl = renderSession.gl;
    var shader = renderSession.shaderManager.tilemapShader;

    renderSession.blendModeManager.setBlendMode(this.blendMode);

    // set the uniforms and texture
    gl.uniformMatrix3fv( shader.uProjectionMatrix, false, this.makeProjection(gl.drawingBufferWidth, gl.drawingBufferHeight) );
    gl.uniform1i( shader.uImageSampler, 0 );
    gl.activeTexture(gl.TEXTURE0);

    // send the transform matrix to the vector shader
    gl.uniformMatrix3fv( shader.uModelMatrix, false, this.transform );

    // check if a texture is dirty..
    if(this.texture.baseTexture._dirty[gl.id])
    {
        renderSession.renderer.updateTexture(this.texture.baseTexture);
    }
    else
    {
        // bind the current texture
        gl.bindTexture(gl.TEXTURE_2D, this.texture.baseTexture._glTextures[gl.id]);
    }

    // bind the source buffer
    gl.bindBuffer( gl.ARRAY_BUFFER, this.positionBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, this.buffer, gl.STATIC_DRAW );
    gl.vertexAttribPointer( shader.aPosition, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( shader.aPosition );

    // draw the buffer: four vertices per quad, one quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};


PIXI.Tilemap.prototype.updateTransform = function()
{
  // x, y, rotation, scalex, scaley
  this.transform = this.makeTransform(100, 100, 0, 1, 1);

  PIXI.DisplayObjectContainer.prototype.updateTransform.call( this );
};


/**
 * When the texture is updated, this event will fire to update the scale and frame
 *
 * @method onTextureUpdate
 * @param event
 * @private
 */

PIXI.Tilemap.prototype.onTextureUpdate = function()
{
    this.updateFrame = true;
};

/**
 * Returns the bounds of the mesh as a rectangle. The bounds calculation takes the worldTransform into account.
 *
 * @method getBounds
 * @param matrix {Matrix} the transformation matrix of the sprite
 * @return {Rectangle} the framing rectangle
 */
PIXI.Tilemap.prototype.getBounds = function(matrix)
{
    var worldTransform = matrix || this.worldTransform;

    var a = worldTransform.a;
    var b = worldTransform.b;
    var c = worldTransform.c;
    var d = worldTransform.d;
    var tx = worldTransform.tx;
    var ty = worldTransform.ty;

    var maxX = -Infinity;
    var maxY = -Infinity;

    var minX = Infinity;
    var minY = Infinity;

    var vertices = this.vertices;
    for (var i = 0, n = vertices.length; i < n; i += 2)
    {
        var rawX = vertices[i], rawY = vertices[i + 1];
        var x = (a * rawX) + (c * rawY) + tx;
        var y = (d * rawY) + (b * rawX) + ty;

        minX = x < minX ? x : minX;
        minY = y < minY ? y : minY;

        maxX = x > maxX ? x : maxX;
        maxY = y > maxY ? y : maxY;
    }

    if (minX === -Infinity || maxY === Infinity)
    {
        return PIXI.EmptyRectangle;
    }

    var bounds = this._bounds;

    bounds.x = minX;
    bounds.width = maxX - minX;

    bounds.y = minY;
    bounds.height = maxY - minY;

    // store a reference so that if this function gets called again in the render cycle we do not have to recalculate
    this._currentBounds = bounds;

    return bounds;
};