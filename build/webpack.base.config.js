const path = require("path");
const nodeExternals = require("webpack-node-externals");

const envName = (env) => {
  if (env.production) {
    return "production";
  }
  if (env.test) {
    return "test";
  }
  return "development";
};

const envToMode = (env) => {
  if (env.production) {
    return "production";
  }
  return "development";
};

module.exports = env => {
  return {
    target: "electron-renderer",
    mode: envToMode(env),
    node: {
      __dirname: false,
      __filename: false
    },
    resolve: {
      alias : {
        canvas : false
      },
      extensions: ['.ts', '.js']
    },
    externals: [nodeExternals()],
    devtool: "source-map",
    module: {
      rules: [
        { test: /\.ts$/, loader: 'ts-loader',
          options: {
            configFile: "tsconfig-electron.json"
          } },
        {
          test: /\.js$/,
          exclude: /(node_modules)|(dist\/server)/,
          loader: "babel-loader",
          options: {
          }
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"]
        }
      ]
    },
  };
};
