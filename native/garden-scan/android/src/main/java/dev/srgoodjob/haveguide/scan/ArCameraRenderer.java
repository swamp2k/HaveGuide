package dev.srgoodjob.haveguide.scan;

import android.opengl.GLES11Ext;
import android.opengl.GLES20;

import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Frame;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

final class ArCameraRenderer {
    private static final float[] QUAD = { -1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f };
    private static final float[] UV = { 0f, 1f, 1f, 1f, 0f, 0f, 1f, 0f };
    private static final String VERTEX =
        "attribute vec4 a_Position; attribute vec2 a_TexCoord; varying vec2 v_TexCoord;" +
        "void main(){ gl_Position=a_Position; v_TexCoord=a_TexCoord; }";
    private static final String FRAGMENT =
        "#extension GL_OES_EGL_image_external : require\n" +
        "precision mediump float; uniform samplerExternalOES u_Texture; varying vec2 v_TexCoord;" +
        "void main(){ gl_FragColor=texture2D(u_Texture,v_TexCoord); }";

    private final FloatBuffer quad = buffer(QUAD);
    private final FloatBuffer transformedUv = buffer(UV);
    private int textureId;
    private int program;
    private int position;
    private int texCoord;
    private int texture;

    int createOnGlThread() {
        int[] textures = new int[1];
        GLES20.glGenTextures(1, textures, 0);
        textureId = textures[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);

        program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, compile(GLES20.GL_VERTEX_SHADER, VERTEX));
        GLES20.glAttachShader(program, compile(GLES20.GL_FRAGMENT_SHADER, FRAGMENT));
        GLES20.glLinkProgram(program);
        position = GLES20.glGetAttribLocation(program, "a_Position");
        texCoord = GLES20.glGetAttribLocation(program, "a_TexCoord");
        texture = GLES20.glGetUniformLocation(program, "u_Texture");
        return textureId;
    }

    void draw(Frame frame) {
        if (frame.hasDisplayGeometryChanged()) {
            FloatBuffer source = buffer(QUAD);
            transformedUv.position(0);
            frame.transformCoordinates2d(
                Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
                source,
                Coordinates2d.TEXTURE_NORMALIZED,
                transformedUv
            );
        }

        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glUseProgram(program);
        quad.position(0);
        transformedUv.position(0);
        GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 0, quad);
        GLES20.glVertexAttribPointer(texCoord, 2, GLES20.GL_FLOAT, false, 0, transformedUv);
        GLES20.glEnableVertexAttribArray(position);
        GLES20.glEnableVertexAttribArray(texCoord);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glUniform1i(texture, 0);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(position);
        GLES20.glDisableVertexAttribArray(texCoord);
    }

    private static int compile(int type, String source) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);
        return shader;
    }

    private static FloatBuffer buffer(float[] values) {
        FloatBuffer result = ByteBuffer.allocateDirect(values.length * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer();
        result.put(values).position(0);
        return result;
    }
}
