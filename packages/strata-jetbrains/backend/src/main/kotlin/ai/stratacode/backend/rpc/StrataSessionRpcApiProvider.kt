@file:Suppress("UnstableApiUsage")

package ai.stratacode.backend.rpc

import ai.stratacode.rpc.StrataSessionRpcApi
import com.intellij.platform.rpc.backend.RemoteApiProvider
import fleet.rpc.remoteApiDescriptor

internal class StrataSessionRpcApiProvider : RemoteApiProvider {
    override fun RemoteApiProvider.Sink.remoteApis() {
        remoteApi(remoteApiDescriptor<StrataSessionRpcApi>()) {
            StrataSessionRpcApiImpl()
        }
    }
}
